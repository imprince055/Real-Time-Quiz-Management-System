const mongoose = require('mongoose');

async function connectDB(uri) {
  await mongoose.connect(uri);
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB };
