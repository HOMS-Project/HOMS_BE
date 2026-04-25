const mongoose = require('mongoose');

const contractTemplateData = [
  {
    name: 'Mẫu hợp đồng vận chuyển tiêu chuẩn 2026',
    description: 'Mẫu hợp đồng vận chuyển nhà cơ bản dành cho khách hàng cá nhân',
    content: `
      <h2>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</h2>
      <h3>Độc lập - Tự do - Hạnh phúc</h3>
      <br />
      <h2>HỢP ĐỒNG VẬN CHUYỂN HÀNG HÓA</h2>
      <p>Số: \${contractNumber}</p>
      
      <p>Hôm nay, ngày \${currentDate}, chúng tôi gồm có:</p>
      
      <h4>Bên A (Bên thuê vận chuyển):</h4>
      <p>Ông/Bà: \${customerName}</p>
      <p>Số điện thoại: \${customerPhone}</p>
      <p>Email: \${customerEmail}</p>

      <h4>Bên B (Bên vận chuyển): HOMS Logistics</h4>
      <p>Đại diện: Quản trị viên</p>
      <p>Địa chỉ: Đà Nẵng, Việt Nam</p>

      <h4>ĐIỀU 1: NỘI DUNG VẬN CHUYỂN</h4>
      <p>Bên B nhận vận chuyển hàng hóa cho Bên A từ địa chỉ nhận hàng đến địa chỉ giao hàng theo thông tin vé \${ticketCode}.</p>
      
      <h4>ĐIỀU 2: PHÍ VẬN CHUYỂN VÀ THANH TOÁN</h4>
      <p>Tổng chi phí vận chuyển là: <strong>\${totalPrice} VNĐ</strong>.</p>
      
      <h4>ĐIỀU 3: TRÁCH NHIỆM CÁC BÊN</h4>
      <p>Bên B chịu trách nhiệm bồi thường nếu xảy ra hư hỏng, mất mát tài sản trong quá trình vận chuyển.</p>
      
      <p>Hợp đồng này được lập thành 02 bản, mỗi bên giữ 01 bản có giá trị pháp lý như nhau.</p>
    `,
    isActive: true
  }
];

module.exports = contractTemplateData;
