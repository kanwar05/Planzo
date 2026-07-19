import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { io as createClient } from "socket.io-client";
import request from "supertest";
import app from "../src/app.js";
import Booking from "../src/models/Booking.js";
import Conversation from "../src/models/Conversation.js";
import Message from "../src/models/Message.js";
import Notification from "../src/models/Notification.js";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import { initializeChatSocket } from "../src/realtime/chatSocket.js";

let mongo; const password = "Planzo@123";
before(async () => { process.env.JWT_SECRET = "chat-test"; mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); await Promise.all([User.syncIndexes(), Vendor.syncIndexes(), Booking.syncIndexes(), Conversation.syncIndexes(), Message.syncIndexes()]); });
beforeEach(async () => Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({}))));
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

async function setup() {
  const [customer, vendorUser, outsider] = await User.create([
    { name: "Chat Customer", email: "chat-customer@example.com", phone: "9555555501", password, role: "customer" },
    { name: "Chat Vendor", email: "chat-vendor@example.com", phone: "9555555502", password, role: "vendor" },
    { name: "Chat Outsider", email: "chat-outsider@example.com", phone: "9555555503", password, role: "customer" },
  ]);
  const vendor = await Vendor.create({ userId: vendorUser._id, businessName: "Chat Events", serviceCategory: "Event Planner", description: "Chat enabled", pricing: 10000, location: "Delhi" });
  const booking = await Booking.create({ customerId: customer._id, vendorId: vendor._id, eventType: "Wedding", eventDate: new Date("2030-10-10"), eventDateOnly: "2030-10-10", eventStartTime: "10:00", eventEndTime: "12:00", eventLocation: "Delhi", budget: 10000 });
  const login = async (email) => { const agent = request.agent(app); const response = await agent.post("/api/auth/login").send({ email, password }); return { agent, cookie: response.headers["set-cookie"].map((item) => item.split(";")[0]).join("; ") }; };
  return { customer, vendorUser, outsider, booking, customerAuth: await login(customer.email), vendorAuth: await login(vendorUser.email), outsiderAuth: await login(outsider.email) };
}

test("booking conversations enforce membership and authenticated HTTP sender identity", async () => {
  const { booking, customer, outsider, customerAuth, vendorAuth, outsiderAuth } = await setup();
  const created = await customerAuth.agent.post("/api/chat/conversations").send({ bookingId: booking._id });
  assert.equal(created.status, 200);
  assert.equal((await outsiderAuth.agent.post("/api/chat/conversations").send({ bookingId: booking._id })).status, 403);
  const conversationId = created.body.conversation._id;
  const sent = await customerAuth.agent.post(`/api/chat/conversations/${conversationId}/messages`).send({ text: "Hello 👋 about the wedding", sender: outsider._id, senderId: outsider._id });
  assert.equal(sent.status, 201);
  assert.equal(String(sent.body.message.sender._id), String(customer._id));
  const list = await vendorAuth.agent.get("/api/chat/conversations");
  assert.equal(list.body.unreadCount, 1);
  const search = await vendorAuth.agent.get(`/api/chat/conversations/${conversationId}/messages`).query({ search: "wedding" });
  assert.equal(search.body.messages.length, 1);
  await vendorAuth.agent.patch(`/api/chat/conversations/${conversationId}/read`);
  assert.equal((await vendorAuth.agent.get("/api/chat/conversations")).body.unreadCount, 0);
  assert.equal((await vendorAuth.agent.delete(`/api/chat/messages/${sent.body.message._id}`)).status, 403);
  const deleted = await customerAuth.agent.delete(`/api/chat/messages/${sent.body.message._id}`);
  assert.ok(deleted.body.message.deletedAt);
  assert.equal(await Notification.countDocuments({ type: "chat_message" }), 1);
});

test("authenticated sockets use JWT user identity and deliver realtime receipts", async () => {
  const { booking, customer, outsider, customerAuth, vendorAuth } = await setup();
  const conversation = (await customerAuth.agent.post("/api/chat/conversations").send({ bookingId: booking._id })).body.conversation;
  const server = createServer(app); const realtime = initializeChatSocket(server, app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const connect = (cookie) => new Promise((resolve, reject) => { const socket = createClient(url, { extraHeaders: { cookie }, transports: ["websocket"] }); socket.once("connect", () => resolve(socket)); socket.once("connect_error", reject); });
  const customerSocket = await connect(customerAuth.cookie); const vendorSocket = await connect(vendorAuth.cookie);
  await Promise.all([new Promise((resolve) => customerSocket.emit("conversation:join", { conversationId: conversation._id }, resolve)), new Promise((resolve) => vendorSocket.emit("conversation:join", { conversationId: conversation._id }, resolve))]);
  const received = new Promise((resolve) => vendorSocket.once("message:new", resolve));
  customerSocket.emit("message:send", { conversationId: conversation._id, text: "Realtime hello 😊", sender: outsider._id, senderId: outsider._id });
  const realtimeMessage = await received;
  assert.equal(realtimeMessage.text, "Realtime hello 😊");
  assert.equal(String(realtimeMessage.sender._id), String(customer._id));
  const typing = new Promise((resolve) => vendorSocket.once("typing:update", resolve));
  customerSocket.emit("typing:start", { conversationId: conversation._id });
  assert.equal((await typing).typing, true);
  const seen = new Promise((resolve) => customerSocket.once("message:seen", resolve));
  vendorSocket.emit("message:seen", { conversationId: conversation._id });
  assert.equal((await seen).userId, String((await User.findOne({ email: "chat-vendor@example.com" }))._id));
  customerSocket.disconnect(); vendorSocket.disconnect(); realtime.io.close();
  await new Promise((resolve) => server.close(resolve));
});
