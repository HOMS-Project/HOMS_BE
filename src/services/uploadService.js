/**
 * uploadService
 * - getPresignUrl(filename, contentType)
 * - processToHLS({ key, bucket, targetPrefix })
 *
 * Notes:
 * - Requires AWS credentials in env: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET (default)
 * - Requires ffmpeg installed on the server (ffmpeg CLI available in PATH).
 * - Installs: npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner uuid
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');

const REGION = process.env.AWS_REGION || 'us-east-1';
const DEFAULT_BUCKET = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;

const s3 = new S3Client({ region: REGION });

async function getPresignUrl(filename, contentType = 'application/octet-stream') {
  const key = `uploads/${Date.now()}-${uuidv4()}-${path.basename(filename)}`;
  const command = new PutObjectCommand({ Bucket: DEFAULT_BUCKET, Key: key, ContentType: contentType });
  const url = await getSignedUrl(s3, command, { expiresIn: 60 * 10 }); // 10 minutes
  return { url, key, bucket: DEFAULT_BUCKET };
}

// Helper to download S3 object to local file
async function downloadFromS3(bucket, key, destPath) {
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  const data = await s3.send(cmd);
  return new Promise((resolve, reject) => {
    const stream = data.Body;
    const writeStream = fs.createWriteStream(destPath);
    stream.pipe(writeStream);
    writeStream.on('finish', () => resolve(destPath));
    writeStream.on('error', reject);
    stream.on('error', reject);
  });
}

// Helper to upload file to S3
async function uploadToS3(bucket, key, filePath, contentType) {
  const body = fs.createReadStream(filePath);
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType });
  await s3.send(command);
}

// Process an uploaded file (key) into HLS segments and upload to targetPrefix on the same bucket
async function processToHLS({ key, bucket = DEFAULT_BUCKET, targetPrefix }) {
  if (!key) throw new Error('key is required');
  targetPrefix = targetPrefix || `hls/${path.basename(key)}-${Date.now()}`;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hls-'));
  const inputFile = path.join(tmpDir, 'input');
  const manifestName = 'index.m3u8';
  const outDir = path.join(tmpDir, 'out');
  fs.mkdirSync(outDir);

  try {
    // 1) download source to local
    await downloadFromS3(bucket, key, inputFile);

    // 2) run ffmpeg to create HLS (segment duration 6s)
    // Example ffmpeg command:
    // ffmpeg -i input -c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 128k -f hls -hls_time 6 -hls_playlist_type vod -hls_segment_filename out/seg%03d.ts out/index.m3u8

    await new Promise((resolve, reject) => {
      const args = [
        '-i', inputFile,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-f', 'hls',
        '-hls_time', '6',
        '-hls_playlist_type', 'vod',
        '-hls_segment_filename', path.join(outDir, 'seg%03d.ts'),
        path.join(outDir, manifestName)
      ];

      const ff = spawn('ffmpeg', args, { stdio: 'inherit' });
      ff.on('error', reject);
      ff.on('close', code => {
        if (code === 0) resolve(); else reject(new Error('ffmpeg exited with ' + code));
      });
    });

    // 3) upload generated files to S3 under targetPrefix
    const files = fs.readdirSync(outDir);
    for (const f of files) {
      const localPath = path.join(outDir, f);
      const s3Key = `${targetPrefix}/${f}`;
      const contentType = f.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/MP2T';
      await uploadToS3(bucket, s3Key, localPath, contentType);
    }

    // 4) return manifest URL (presigned GET) so FE can play it via HLS (or front the bucket with CDN)
    const manifestKey = `${targetPrefix}/${manifestName}`;
    // produce a signed URL for the manifest with reasonable expiry
    const getCmd = new GetObjectCommand({ Bucket: bucket, Key: manifestKey });
    const manifestUrl = await getSignedUrl(s3, getCmd, { expiresIn: 60 * 60 * 24 }); // 24h

    return { manifestUrl, bucket, manifestKey };
  } finally {
    // cleanup tmp files
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
}

module.exports = {
  getPresignUrl,
  processToHLS
};