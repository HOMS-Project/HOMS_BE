# 🚚 HOMS - Home Moving Service (Backend)

Welcome to the Backend repository for **HOMS (Home Moving Service)**! This provides the core RESTful API, real-time socket connections, and database management for the HOMS ecosystem (Web and Mobile apps).

## 🚀 Technologies Used
- **Core:** Node.js, Express.js
- **Database:** MongoDB & Mongoose
- **Authentication & Security:** JWT, Bcryptjs, Helmet, CORS, Express Rate Limit
- **Real-time:** Socket.io
- **Storage:** Cloudinary, AWS S3 (`@aws-sdk/client-s3`)
- **File Uploads:** Multer
- **AI Integration:** Google Generative AI (`@google/generative-ai`)
- **Payments:** PayOS (`@payos/node`)
- **Geolocation:** Turf.js (`@turf/turf`)
- **Other utilities:** Nodemailer (Emails), Node-cron (Task Scheduling), PDFKit & html-docx-js (Document generation), Joi (Validation)

## 🛠️ Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [MongoDB](https://www.mongodb.com/) instance (local or Atlas)

### Installation

1. Navigate to the backend directory:
   ```bash
   cd HOMS_BE
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory and add your configuration (MongoDB URI, JWT Secret, Cloudinary credentials, PayOS keys, AWS config, Gemini API Key, etc.).

### Database Seeding
To initialize the database with default data (if applicable):
```bash
npm run db:clear   # Clears the database
npm run db:seed    # Seeds the database with initial data
npm run db:reset   # Clears and then seeds the database
```

### Running the Server

- **Development Mode** (with auto-reload):
  ```bash
  npm run dev
  ```
- **Production Mode**:
  ```bash
  npm start
  ```

## 📁 Project Structure
- `src/` - Application source code (controllers, models, routes, middleware, services).
  - `src/app.js` - Application entry point.
- `db_exports/` - Database backups/exports.

## 📄 License
This project is licensed under the ISC License.
