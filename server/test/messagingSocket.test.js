import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, afterEach, test } from "node:test";
import jwt from "jsonwebtoken";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { io as connectSocket } from "socket.io-client";
import request from "supertest";
import app from "../src/app.js";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import Booking from "../src/models/Booking.js";
import Conversation from "../src/models/Conversation.js";
import Message from "../src/models/Message.js";
import NotificationOutbox from "../src/models/NotificationOutbox.js";
import { createMessagingSocketServer, isSocketRequestAllowed, socketClientAddress } from "../src/realtime/messagingSocket.js";
import { authenticateAccessToken } from "../src/services/sessionAuthenticationService.js";
import { generateAccessToken } from "../src/utils/generateToken.js";
import { resetMessagingRateLimitsForTests } from "../src/utils/messagingRateLimit.js";

let mongo, server, realtime, origin;
let number = 0;
const clients = new Set();
const frontend = "http://localhost:5173";
const token = actor => generateAccessToken(actor._id, actor.authVersion || 0);
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const user = (role, extra = {}) => User.create({ name: `Socket Account ${++number}`, email: `socket-${number}@example.test`,
  phone: "9876543210", password: "SocketSecure123!", role, emailVerifiedAt: new Date(), ...extra });
async function fixture() {
  const [customer, owner] = await Promise.all([user("customer"), user("vendor")]);
  const vendor = await Vendor.create({ userId: owner._id, businessName: "Messaging Studio", serviceCategory: "Decoration",
    description: "Thoughtful event decoration.", location: "Delhi", pricing: 5000, verificationStatus: "approved", verified: true });
  const booking = await Booking.create({ customerId: customer._id, vendorId: vendor._id, eventType: "Wedding",
    eventDate: new Date(Date.now() + 30 * 86400000), eventLocation: "Delhi hall", description: "A garden celebration." });
  return { customer, owner, vendor, booking, bookingId: String(booking._id) };
}
function openSocket({ accessToken, cookie, requestOrigin = frontend, auth, headers = {} } = {}) {
  const extraHeaders = { ...headers };
  if (accessToken) extraHeaders.Authorization = `Bearer ${accessToken}`;
  if (cookie) extraHeaders.Cookie = cookie;
  if (requestOrigin !== null) extraHeaders.Origin = requestOrigin;
  const socket = connectSocket(origin, { autoConnect: false, reconnection: false, transports: ["websocket"],
    extraHeaders, auth, timeout: 4000 });
  clients.add(socket);
  return socket;
}
async function connected(options) {
  const socket = openSocket(options);
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
    socket.connect();
  });
  return socket;
}
async function connectionFailure(options) {
  const socket = openSocket(options);
  return new Promise((resolve, reject) => {
    socket.once("connect", () => { socket.disconnect(); reject(new Error("Unexpected authenticated socket connection")); });
    socket.once("connect_error", error => { socket.disconnect(); resolve(error); });
    socket.connect();
  });
}
const emit = (socket, event, data) => new Promise((resolve, reject) => {
  socket.timeout(6000).emit(event, data, (error, result) => error ? reject(error) : resolve(result));
});
const join = (socket, bookingId) => emit(socket, "conversation:join", { bookingId });
function event(socket, name, predicate = () => true, milliseconds = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, receive); reject(new Error(`Timed out waiting for ${name}`)); }, milliseconds);
    function receive(data) {
      if (!predicate(data)) return;
      clearTimeout(timer); socket.off(name, receive); resolve(data);
    }
    socket.on(name, receive);
  });
}

before(async () => {
  process.env.JWT_SECRET = "messaging-socket-tests-secret-at-least-32-characters";
  process.env.CLIENT_URL = frontend;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), Vendor.init(), Booking.init(), Conversation.init(), Message.init(), NotificationOutbox.init()]);
  server = createServer(app);
  realtime = createMessagingSocketServer(server, { app });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  resetMessagingRateLimitsForTests();
  await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({})));
});
afterEach(async () => {
  for (const socket of clients) socket.disconnect();
  clients.clear();
  // Let disconnect handlers finish their bounded presence checks before cleanup.
  await delay(30);
});
after(async () => {
  await new Promise(resolve => realtime?.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
});

test("socket request guard requires allowed browser origins and trusts forwarded TLS only behind the configured proxy", () => {
  const guarded = express();
  const request = { headers: { origin: frontend, "x-forwarded-proto": "https" }, socket: { remoteAddress: "203.0.113.10" } };
  assert.equal(isSocketRequestAllowed(request, { app: guarded, origins: [frontend], production: true }), false);
  guarded.set("trust proxy", 1);
  assert.equal(isSocketRequestAllowed(request, { app: guarded, origins: [frontend], production: true }), true);
  assert.equal(isSocketRequestAllowed({ ...request, headers: { ...request.headers, origin: "https://foreign.example" } },
    { app: guarded, origins: [frontend], production: true }), false);
  assert.equal(isSocketRequestAllowed({ headers: { cookie: "eventifyy_access=credential" }, socket: {} },
    { app: guarded, origins: [frontend], production: false }), false);
  assert.equal(isSocketRequestAllowed({ headers: {}, socket: { encrypted: true } },
    { app: guarded, origins: [frontend], production: true }), true);
});

test("socket connection limits share Express client-IP semantics and ignore untrusted forwarded identities", () => {
  const guarded = express();
  const request = { headers: { "x-forwarded-for": "192.0.2.99, 203.0.113.10" },
    socket: { remoteAddress: "10.0.0.2" }, connection: { remoteAddress: "10.0.0.2" } };
  assert.equal(socketClientAddress(request, guarded), "10.0.0.2");
  guarded.set("trust proxy", 1);
  assert.equal(socketClientAddress(request, guarded), "203.0.113.10");
  assert.equal(socketClientAddress({ ...request, headers: { "x-forwarded-for": "192.0.2.99, 203.0.113.11" } }, guarded), "203.0.113.11");
  assert.equal(socketClientAddress(request), "10.0.0.2");
});

test("sockets share HTTP cookie precedence and accept verified bearer/auth credentials without exposing private fields", async () => {
  const { customer, bookingId } = await fixture();
  const bearer = await connected({ accessToken: token(customer), requestOrigin: null });
  assert.equal((await join(bearer, bookingId)).success, true);
  const cookie = await connected({ cookie: `eventifyy_access=${token(customer)}` });
  const result = await join(cookie, bookingId);
  assert.equal(result.success, true);
  assert.doesNotMatch(JSON.stringify(result), /socket-\d+@|9876543210|password|authVersion|bookingGuardRevision/);
  const explicit = await connected({ auth: { token: token(customer) }, requestOrigin: null });
  assert.equal((await join(explicit, bookingId)).success, true);
  const invalid = await connectionFailure({ accessToken: token(customer), cookie: "eventifyy_access=invalid-cookie" });
  assert.equal(invalid.data.status, 401);
  assert.equal((await request(app).get("/api/auth/me").set("Cookie", "eventifyy_access=invalid-cookie")
    .set("Authorization", `Bearer ${token(customer)}`)).status, 401);
});

test("socket handshakes reject missing credentials, wrong token types, foreign/missing cookie origins, admins and unavailable accounts", async () => {
  const { customer } = await fixture();
  assert.equal((await connectionFailure({})).data.status, 401);
  const wrong = jwt.sign({ id: customer._id, type: "refresh", authVersion: 0 }, process.env.JWT_SECRET, { expiresIn: "15m" });
  assert.equal((await connectionFailure({ accessToken: wrong })).data.status, 401);
  const expired = jwt.sign({ id: customer._id, type: "access", authVersion: 0 }, process.env.JWT_SECRET, { expiresIn: -1 });
  assert.equal((await connectionFailure({ accessToken: expired })).data.status, 401);
  await connectionFailure({ cookie: `eventifyy_access=${token(customer)}`, requestOrigin: null });
  await connectionFailure({ accessToken: token(customer), requestOrigin: "https://foreign.example" });
  const admin = await user("admin");
  assert.equal((await connectionFailure({ accessToken: token(admin) })).data.status, 403);
  await User.updateOne({ _id: customer._id }, { $set: { suspendedAt: new Date() } });
  assert.equal((await connectionFailure({ accessToken: token(customer) })).data.status, 403);
});

test("shared authentication preserves legacy password-change and current credential-version revocation checks", async () => {
  const { customer } = await fixture();
  const legacy = jwt.sign({ id: customer._id }, process.env.JWT_SECRET, { expiresIn: "15m" });
  assert.equal(String((await authenticateAccessToken(legacy)).user._id), String(customer._id));
  await User.updateOne({ _id: customer._id }, { $set: { passwordChangedAt: new Date(Date.now() + 1000) } });
  await assert.rejects(authenticateAccessToken(legacy), { statusCode: 401 });
  const versioned = token(customer);
  await User.updateOne({ _id: customer._id }, { $inc: { authVersion: 1 } });
  await assert.rejects(authenticateAccessToken(versioned), { statusCode: 401 });
});

test("cross-booking socket events, sender spoofing and unknown events cannot create messages or disclose history", async () => {
  const { customer, bookingId } = await fixture();
  const stranger = await user("customer");
  const own = await connected({ accessToken: token(customer) });
  const foreign = await connected({ accessToken: token(stranger) });
  assert.equal((await join(own, bookingId)).success, true);
  assert.equal((await join(foreign, bookingId)).status, 403);
  for (const [name, data] of [
    ["message:send", { bookingId, clientMessageId: randomUUID(), body: "Unauthorized message" }],
    ["conversation:read", { bookingId, throughSequence: 1 }],
    ["conversation:typing", { bookingId, isTyping: true }],
  ]) assert.equal((await emit(foreign, name, data)).status, 403);
  assert.equal((await emit(own, "message:send", { bookingId, senderId: stranger._id, clientMessageId: randomUUID(), body: "Spoof" })).status, 400);
  assert.equal((await emit(own, "join", { bookingId })).status, 400);
  assert.equal(await Message.countDocuments(), 0);
});

test("socket sends persist before peer delivery, retry once and publish only authorized read receipts", async () => {
  const { customer, owner, bookingId } = await fixture();
  const customerSocket = await connected({ accessToken: token(customer) });
  const vendorSocket = await connected({ accessToken: token(owner) });
  await join(customerSocket, bookingId); await join(vendorSocket, bookingId);
  const delivery = event(vendorSocket, "message:new");
  const body = { bookingId, clientMessageId: randomUUID(), body: "Can we use seasonal flowers?" };
  const sent = await emit(customerSocket, "message:send", body);
  assert.equal(sent.success, true, sent.message);
  const delivered = await delivery;
  assert.equal(delivered.message._id, sent.message._id);
  assert.equal(delivered.message.sequence, 1);
  assert.equal((await Message.findById(sent.message._id)).body, body.body);
  assert.equal((await emit(customerSocket, "message:send", body)).message._id, sent.message._id);
  assert.equal(await Message.countDocuments(), 1);
  const receipt = event(customerSocket, "conversation:read");
  const read = await emit(vendorSocket, "conversation:read", { bookingId, throughSequence: 1 });
  assert.equal(read.success, true, read.message);
  assert.equal(read.conversation.unreadCount, 0);
  assert.equal((await receipt).readerRole, "vendor");
  assert.equal((await emit(vendorSocket, "conversation:read", { bookingId, throughSequence: 999 })).status, 400);
});

test("reconnected clients retrieve missed persisted messages through authorized history", async () => {
  const { customer, owner, bookingId } = await fixture();
  const first = await connected({ accessToken: token(customer) });
  await join(first, bookingId); first.disconnect();
  const vendor = await connected({ accessToken: token(owner) });
  await join(vendor, bookingId);
  const sent = await emit(vendor, "message:send", { bookingId, clientMessageId: randomUUID(), body: "We can include the stage setup." });
  assert.equal(sent.success, true, sent.message);
  const resumed = await connected({ accessToken: token(customer) });
  assert.equal((await join(resumed, bookingId)).conversation.unreadCount, 1);
  const history = await request(app).get(`/api/bookings/${bookingId}/messages?after=0`).set("Authorization", `Bearer ${token(customer)}`);
  assert.equal(history.status, 200, history.body.message);
  assert.deepEqual(history.body.messages.map(message => message._id), [sent.message._id]);
});

test("revoked target credentials stop live delivery while the message remains available to a new authenticated session", async () => {
  const { customer, owner, bookingId } = await fixture();
  const sender = await connected({ accessToken: token(customer) });
  const stale = await connected({ accessToken: token(owner) });
  await join(sender, bookingId); await join(stale, bookingId);
  const received = []; stale.on("message:new", value => received.push(value));
  const disconnected = event(stale, "disconnect");
  await User.updateOne({ _id: owner._id }, { $inc: { authVersion: 1 } });
  const sent = await emit(sender, "message:send", { bookingId, clientMessageId: randomUUID(), body: "Saved despite stale recipient session." });
  assert.equal(sent.success, true, sent.message);
  await disconnected;
  assert.equal(received.length, 0);
  const fresh = await connected({ accessToken: token({ ...owner.toObject(), authVersion: 1 }) });
  assert.equal((await join(fresh, bookingId)).conversation.unreadCount, 1);
  assert.equal(await Message.countDocuments(), 1);
});

test("live suspension blocks sending and terminal/unverified conversations remain readable without write or typing permissions", async () => {
  const { customer, owner, booking, bookingId } = await fixture();
  const own = await connected({ accessToken: token(customer) });
  const vendor = await connected({ accessToken: token(owner) });
  await join(own, bookingId); await join(vendor, bookingId);
  await User.updateOne({ _id: owner._id }, { $set: { emailVerifiedAt: null } });
  assert.equal((await emit(vendor, "conversation:typing", { bookingId, isTyping: true })).status, 403);
  assert.equal((await join(vendor, bookingId)).success, true);
  await Booking.updateOne({ _id: booking._id }, { $set: { status: "cancelled" } });
  assert.equal((await join(own, bookingId)).conversation.canSend, false);
  assert.equal((await emit(own, "message:send", { bookingId, clientMessageId: randomUUID(), body: "Closed" })).status, 409);
  assert.equal((await emit(own, "conversation:typing", { bookingId, isTyping: true })).status, 409);
  await User.updateOne({ _id: customer._id }, { $set: { suspendedAt: new Date() } });
  const disconnected = event(own, "disconnect");
  assert.equal((await emit(own, "message:send", { bookingId, clientMessageId: randomUUID(), body: "Suspended" })).status, 403);
  await disconnected;
  assert.equal(await Message.countDocuments(), 0);
});

test("typing and conversation presence are scoped to authorized peers and clear on leave", async () => {
  const { customer, owner, bookingId } = await fixture();
  const customerSocket = await connected({ accessToken: token(customer) });
  const vendorSocket = await connected({ accessToken: token(owner) });
  await join(customerSocket, bookingId);
  const online = event(customerSocket, "conversation:presence", value => value.online);
  await join(vendorSocket, bookingId);
  assert.equal((await online).peerRole, "vendor");
  const typing = event(customerSocket, "conversation:typing", value => value.isTyping);
  assert.equal((await emit(vendorSocket, "conversation:typing", { bookingId, isTyping: true })).success, true);
  assert.ok(new Date((await typing).expiresAt).getTime() <= Date.now() + 5000);
  const stopped = event(customerSocket, "conversation:typing", value => !value.isTyping);
  await emit(vendorSocket, "conversation:typing", { bookingId, isTyping: false });
  await stopped;
  const offline = event(customerSocket, "conversation:presence", value => !value.online);
  await emit(vendorSocket, "conversation:leave", { bookingId });
  await offline;
});

test("concurrent connections share the per-user cap and close cleanly", async () => {
  const { customer } = await fixture();
  const results = await Promise.allSettled(Array.from({ length: 11 }, () => connected({ accessToken: token(customer) })));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 10);
  const failure = results.find(result => result.status === "rejected");
  assert.equal(failure.reason.data.status, 429);
});

test("an established socket expires with its access credential and can reconnect with a refreshed credential", async () => {
  const { customer, bookingId } = await fixture();
  const shortToken = jwt.sign({ id: customer._id, type: "access", authVersion: 0 }, process.env.JWT_SECRET, { expiresIn: 2 });
  const socket = await connected({ accessToken: shortToken });
  await join(socket, bookingId);
  await event(socket, "disconnect", () => true, 4000);
  const refreshed = await connected({ accessToken: token(customer) });
  assert.equal((await join(refreshed, bookingId)).success, true);
});
