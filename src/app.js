require("dotenv").config();
const express = require("express");
const connectDB = require("./config/database");

const app = express();
connectDB();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("HOMS Backend is running 🚚");
});

const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);

const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;

