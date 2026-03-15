// MongoDB Shell Command to Insert Dispatchers:
db.users.insertMany([
  {
    "fullName": "Điều phối viên Tổng",
    "email": "head.dispatcher@homs.com",
    "password": "$2b$10$pnoVlOGP/4YhrSQST.TjfO2kf8GCsv0aJ2gTqeju5ycQsTmFy9C3a",
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
    "password": "$2b$10$iiqlDclJAMxuainUXo1DA.I.4wc5nb9UYHcxLy9KUzOkg6zZx4N3G",
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
    "password": "$2b$10$L5aZWAgxM5kzihCt6itKUeu6yxYUxFErDKlYYBBFyaqatM21Kfyca",
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
    "password": "$2b$10$vqUL8XOSMd4JUxPCED3FVOWUCzi6eraUhJE4nnTVv0Tp1PLoDCdjW",
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
    "password": "$2b$10$o87oe4aPmAR2nbaHpWevu.TQISeZCNzaGZ3XnS6b37LppdwLAPxae",
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
    "password": "$2b$10$ymlKbo.Yg1ccVaL0C8Q4xO0Zgi84CIng8ERST2hfiZVpIAT4r66Ki",
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
    "password": "$2b$10$U0fxIN3p13jJbF2wZz2UlOuofHhAzLnD/OS7cMQSAP1vvbu5i5wYG",
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
    "password": "$2b$10$piBp5mYcI.6Q4P8js1ix3u5YCS91W/lyBM73qhzelfpy0nYrQEzfm",
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