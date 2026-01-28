require("dotenv").config();
const express = require("express");
const connectDB = require("./config/database");
const errorMiddleware = require("./middlewares/errorMiddleware"); 
const cors = require('cors');
const app = express();
connectDB();
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("HOMS Backend is running 🚚");
});

const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);
app.use(errorMiddleware);
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;

