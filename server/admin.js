import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from './src/models/User.js';

dotenv.config();

async function ensureAdminEntry() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGO_URI is not set');
  }

  await mongoose.connect(uri);

  const targetEmail = 'kanwar@gmail.com';

  const existing = await User.findOne({ email: targetEmail });

  if (existing) {
    console.log('Admin already exists');

    existing.role = 'admin';
    await existing.save();

    console.log('Role updated to admin.');
  } else {
    const created = await User.create({
      name: 'Kanwar',
      email: targetEmail,
      phone: '1234567809',
      password: 'Kanwar@123',
      role: 'admin',
    });

    console.log('Admin created:', created.email);
  }

  await mongoose.disconnect();
}

ensureAdminEntry().catch((err) => {
  console.error(err);
  process.exit(1);
});