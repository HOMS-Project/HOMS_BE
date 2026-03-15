// MongoDB Shell Command to Insert Dispatchers:
db.users.insertMany([
  {
    "fullName": "Điều phối viên Tổng",
    "email": "head.dispatcher@homs.com",
    "password": "$2b$10$P1aLNsMwEc3rXwYckie7Q.lOwIeh2XA46/NuXBs.it6LRIVlDHuni",
    "role": "dispatcher",
    "status": "Active",
    "dispatcherProfile": {
      "workingAreas": [],
      "isGeneral": true,
      "isAvailable": true
    }
  },
  {
    "fullName": "Điều phối viên Hải Châu",
    "email": "haichau.disp@homs.com",
    "password": "$2b$10$TWk.tsRekXWmuQpgypkzEeoXJOtTDIlF28af3ty/I8fY9C0mvZaiq",
    "role": "dispatcher",
    "status": "Active",
    "dispatcherProfile": {
      "workingAreas": [
        "Hải Châu"
      ],
      "isGeneral": false,
      "isAvailable": true
    }
  },
  {
    "fullName": "Điều phối viên Thanh Khê",
    "email": "thanhkhe.disp@homs.com",
    "password": "$2b$10$BfeKduweFAHRd2OjUQWcK.o5m2e1UARdMVn4A0tGxglVMRE7tF./6",
    "role": "dispatcher",
    "status": "Active",
    "dispatcherProfile": {
      "workingAreas": [
        "Thanh Khê"
      ],
      "isGeneral": false,
      "isAvailable": true
    }
  },
  {
    "fullName": "Điều phối viên Sơn Trà",
    "email": "sontra.disp@homs.com",
    "password": "$2b$10$kQjA6Ds8NgyLIR6jKbIRduPFbMI9Zn.CrWS0j1NLBdf/L9EJQOkIa",
    "role": "dispatcher",
    "status": "Active",
    "dispatcherProfile": {
      "workingAreas": [
        "Sơn Trà"
      ],
      "isGeneral": false,
      "isAvailable": true
    }
  },
  {
    "fullName": "Điều phối viên Ngũ Hành Sơn",
    "email": "nguhanhson.disp@homs.com",
    "password": "$2b$10$ngIsmRPhLsohvR9wn3CSUO9EMAPyVgjEZEbsqAaUirmozK/QwPzea",
    "role": "dispatcher",
    "status": "Active",
    "dispatcherProfile": {
      "workingAreas": [
        "Ngũ Hành Sơn"
      ],
      "isGeneral": false,
      "isAvailable": true
    }
  },
  {
    "fullName": "Điều phối viên Liên Chiểu",
    "email": "lienchieu.disp@homs.com",
    "password": "$2b$10$ZWRJAe6Ij7P6KIhVYvBV7.fmgyywoRM3Jq/tPE6QJc.uq0266lOXi",
    "role": "dispatcher",
    "status": "Active",
    "dispatcherProfile": {
      "workingAreas": [
        "Liên Chiểu"
      ],
      "isGeneral": false,
      "isAvailable": true
    }
  },
  {
    "fullName": "Điều phối viên Cẩm Lệ",
    "email": "camle.disp@homs.com",
    "password": "$2b$10$PiqFy7kPCp9ZfC/K8r9.8eZ1bN8qFL4h7BoZ87w/fkSEaa2Dgl2wm",
    "role": "dispatcher",
    "status": "Active",
    "dispatcherProfile": {
      "workingAreas": [
        "Cẩm Lệ"
      ],
      "isGeneral": false,
      "isAvailable": true
    }
  },
  {
    "fullName": "Điều phối viên Hòa Vang",
    "email": "hoavang.disp@homs.com",
    "password": "$2b$10$MgPjwpP5tX4NeytK1/WhIOc/Y12.J/vVoMwBCGPnS.Z72DWbWKjcO",
    "role": "dispatcher",
    "status": "Active",
    "dispatcherProfile": {
      "workingAreas": [
        "Hòa Vang"
      ],
      "isGeneral": false,
      "isAvailable": true
    }
  }
]);