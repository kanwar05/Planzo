import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, mock, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import app from "../src/app.js";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import Booking from "../src/models/Booking.js";
import Conversation from "../src/models/Conversation.js";
import Message from "../src/models/Message.js";
import NotificationOutbox from "../src/models/NotificationOutbox.js";
import { normalizeMessageInput, sendMessage } from "../src/services/messagingService.js";
import { onMessagingEvent } from "../src/services/messagingEvents.js";
import { conversationView, messageView } from "../src/services/messagingViewService.js";
import { consumeMessagingRate, resetMessagingRateLimitsForTests } from "../src/utils/messagingRateLimit.js";
import { generateAccessToken } from "../src/utils/generateToken.js";

let mongo;
let sequence = 0;
const day = () => new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
const auth = actor => `Bearer ${generateAccessToken(actor._id, actor.authVersion || 0)}`;
const user = (role, extra = {}) => User.create({
  name: `Messaging Account ${++sequence}`, email: `messaging-${sequence}@example.test`, phone: "9876543210",
  password: "MessagingSecure123!", role, emailVerifiedAt: new Date(), ...extra,
});
async function fixture() {
  const [customer, owner, stranger, otherVendor, admin] = await Promise.all([
    user("customer"), user("vendor"), user("customer"), user("vendor"), user("admin"),
  ]);
  const vendor = await Vendor.create({ userId: owner._id, businessName: "Messaging Studio", serviceCategory: "Decoration",
    description: "Thoughtful floral decoration.", location: "Delhi", pricing: 5000,
    verificationStatus: "approved", verified: true, contactDetails: { email: "shared-business@example.test" } });
  const booking = await Booking.create({ customerId: customer._id, vendorId: vendor._id, eventType: "Wedding",
    eventDate: new Date(`${day()}T00:00:00.000Z`), eventLocation: "Delhi event hall", description: "A garden wedding." });
  return { customer, owner, stranger, otherVendor, admin, vendor, booking };
}
const route = bookingId => `/api/bookings/${bookingId}`;
const send = (actor, bookingId, body = "Hello about this booking", clientMessageId = randomUUID(), extra = {}) => request(app)
  .post(`${route(bookingId)}/messages`).set("Authorization", auth(actor)).send({ body, clientMessageId, ...extra });
const read = (actor, bookingId, throughSequence) => request(app).patch(`${route(bookingId)}/conversation/read`)
  .set("Authorization", auth(actor)).send({ throughSequence });
const history = (actor, bookingId, query = {}) => request(app).get(`${route(bookingId)}/messages`).query(query).set("Authorization", auth(actor));
const view = (actor, bookingId) => request(app).get(`${route(bookingId)}/conversation`).set("Authorization", auth(actor));
const init = (actor, bookingId) => request(app).post(`${route(bookingId)}/conversation`).set("Authorization", auth(actor)).send({});
const unread = (actor, bookingIds) => request(app).get("/api/conversations/unread")
  .query(bookingIds === undefined ? {} : { bookingIds }).set("Authorization", auth(actor));

before(async () => {
  process.env.JWT_SECRET = "messaging-tests-secret-with-at-least-32-characters";
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), Vendor.init(), Booking.init(), Conversation.init(), Message.init(), NotificationOutbox.init()]);
});
beforeEach(async () => {
  mock.restoreAll(); resetMessagingRateLimitsForTests();
  await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({})));
});
after(async () => { mock.restoreAll(); await mongoose.disconnect(); await mongo?.stop(); });

test("message validation bounds plain text, sanitizes control characters and rejects spoofed identities", () => {
  const key = randomUUID();
  assert.deepEqual(normalizeMessageInput({ clientMessageId: key, body: " \u202eHello\r\nworld\u0000 " }), { clientMessageId: key, body: "Hello\nworld" });
  assert.equal(normalizeMessageInput({ clientMessageId: key, body: "<script>literal text</script>" }).body, "<script>literal text</script>");
  for (const data of [null, [], {}, { clientMessageId: key, body: "\u0000\u202e " },
    { clientMessageId: key, body: "x".repeat(4001) }, { clientMessageId: key, body: {} },
    { clientMessageId: [key], body: "Hello" }, { clientMessageId: "short", body: "Hello" },
    { clientMessageId: key, body: "Hello", senderId: "spoof" }, { clientMessageId: key, body: "Hello", senderRole: "vendor" },
  ]) assert.throws(() => normalizeMessageInput(data), { statusCode: 400 });
});

test("messaging serializers expose only typed bounded primitives while preserving valid message text", () => {
  const poison = { privateContact: "PRIVATE_CONTACT" };
  const bookingId = new mongoose.Types.ObjectId();
  const access = { selfRole: "customer", booking: { _id: bookingId, status: "pending" },
    vendor: { businessName: poison }, customer: { emailVerifiedAt: new Date() }, vendorOwner: {} };
  const malformed = conversationView({ _id: poison, lastSequence: poison, customerReadSequence: poison,
    vendorReadSequence: poison, customerUnreadCount: poison, customerReadAt: poison, vendorReadAt: poison }, access);
  assert.equal(malformed.peer.name, "Vendor");
  assert.equal(malformed.lastSequence, 0);
  assert.equal(malformed.selfReadSequence, 0);
  assert.equal(malformed.peerReadSequence, 0);
  assert.equal(malformed.unreadCount, 0);
  assert.equal(malformed.readAt, null);
  assert.equal(malformed.peerReadAt, null);
  assert.equal(malformed._id, null);
  assert.doesNotMatch(JSON.stringify(malformed), /PRIVATE_CONTACT/);
  access.vendor.businessName = "v".repeat(121);
  assert.equal(conversationView(null, access).peer.name.length, 120);
  access.selfRole = "vendor";
  access.customer.name = "c".repeat(81);
  assert.equal(conversationView(null, access).peer.name.length, 80);
  access.customer.name = poison;
  assert.equal(conversationView(null, access).peer.name, "Customer");
  assert.deepEqual(messageView({ _id: poison, conversationId: poison, bookingId: poison,
    sequence: poison, senderRole: poison, clientMessageId: poison, body: poison, createdAt: poison }), {});
  assert.deepEqual(messageView({ sequence: Number.MAX_SAFE_INTEGER + 1, senderRole: "admin",
    clientMessageId: "x".repeat(129), body: "x".repeat(4001), createdAt: new Date(NaN) }), {});
  const valid = { _id: new mongoose.Types.ObjectId(), conversationId: new mongoose.Types.ObjectId(), bookingId,
    sequence: 1, senderRole: "customer", clientMessageId: randomUUID(),
    body: "Exact <plain text>\nwith spaces and an emoji 🌷", createdAt: new Date() };
  const rendered = messageView(valid);
  assert.equal(rendered.body, valid.body);
  assert.equal(rendered.sequence, valid.sequence);
  assert.equal(rendered.senderRole, valid.senderRole);
  assert.equal(rendered._id, valid._id.toString());
  assert.equal(rendered.conversationId, valid.conversationId.toString());
  assert.equal(rendered.bookingId, valid.bookingId.toString());
  assert.equal(rendered.clientMessageId, valid.clientMessageId);
  assert.equal(rendered.createdAt, valid.createdAt);
});

test("malformed legacy participant names cannot leak nested contacts through conversation or message history", async () => {
  const { customer, owner, vendor, booking } = await fixture();
  const body = "Keep this exact <message>\nand its scope.";
  assert.equal((await send(customer, booking._id, body)).status, 201);
  await Vendor.collection.updateOne({ _id: vendor._id }, { $set: { businessName: { privateEmail: "PRIVATE_CONTACT" } } });
  for (const result of [await view(customer, booking._id), await history(customer, booking._id)]) {
    assert.equal(result.status, 200, result.body.message);
    assert.equal(result.body.conversation.peer.name, "Vendor");
    assert.doesNotMatch(JSON.stringify(result.body), /PRIVATE_CONTACT/);
  }
  assert.equal((await history(customer, booking._id)).body.messages[0].body, body);
  await User.collection.updateOne({ _id: customer._id }, { $set: { name: { privatePhone: "PRIVATE_CONTACT" } } });
  for (const result of [await view(owner, booking._id), await history(owner, booking._id)]) {
    assert.equal(result.status, 200, result.body.message);
    assert.equal(result.body.conversation.peer.name, "Customer");
    assert.doesNotMatch(JSON.stringify(result.body), /PRIVATE_CONTACT/);
  }
});

test("only the associated customer/vendor read history; empty reads create no conversation or email", async () => {
  const { customer, owner, stranger, otherVendor, admin, booking } = await fixture();
  assert.equal((await request(app).get(`${route(booking._id)}/conversation`)).status, 401);
  for (const actor of [stranger, otherVendor, admin]) {
    assert.equal((await view(actor, booking._id)).status, 403);
    assert.equal((await history(actor, booking._id)).status, 403);
    assert.equal((await send(actor, booking._id)).status, 403);
    assert.equal((await read(actor, booking._id, 0)).status, 403);
  }
  const response = await view(customer, booking._id);
  assert.equal(response.status, 200, response.body.message);
  assert.equal(response.body.conversation._id, null);
  assert.equal(response.body.conversation.peer.name, "Messaging Studio");
  assert.equal(response.body.conversation.selfRole, "customer");
  assert.equal(response.body.conversation.canSend, true);
  assert.equal((await view(owner, booking._id)).body.conversation.selfRole, "vendor");
  assert.doesNotMatch(JSON.stringify(response.body), /messaging-\d+@|9876543210|password|authVersion|AlertAfter|GuardRevision/);
  assert.equal(await Conversation.countDocuments(), 0);
  assert.equal(await NotificationOutbox.countDocuments(), 0);
});

test("simultaneous initializations create exactly one conversation for the booking", async () => {
  const { customer, owner, vendor, booking } = await fixture();
  const results = await Promise.all([init(customer, booking._id), init(owner, booking._id), init(customer, booking._id)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 200, 201]);
  assert.equal(new Set(results.map(result => result.body.conversation._id)).size, 1);
  const stored = await Conversation.findOne().lean();
  assert.equal(String(stored.customerId), String(customer._id));
  assert.equal(String(stored.vendorUserId), String(owner._id));
  assert.equal(String(stored.vendorId), String(vendor._id));
  assert.equal(stored.lastSequence, 0);
  assert.equal(await Conversation.countDocuments(), 1);
  assert.equal(await Message.countDocuments(), 0);
});

test("messages persist with stable IDs, server identities, private-safe views and recipient-only unread counts", async () => {
  const { customer, owner, booking } = await fixture();
  const initialBooking = await Booking.findById(booking._id).lean();
  const first = await send(customer, booking._id, "Hello about <flowers>");
  assert.equal(first.status, 201, first.body.message);
  assert.match(first.body.message._id, /^[a-f0-9]{24}$/);
  assert.equal(first.body.message.sequence, 1);
  assert.equal(first.body.message.senderRole, "customer");
  assert.equal(first.body.message.body, "Hello about <flowers>");
  assert.equal(first.body.conversation.unreadCount, 0);
  const second = await send(owner, booking._id, "We can discuss your flowers.");
  assert.equal(second.status, 201, second.body.message);
  assert.equal(second.body.message.sequence, 2);
  assert.equal(second.body.conversation.unreadCount, 1);
  const messages = (await history(customer, booking._id)).body.messages;
  assert.deepEqual(messages.map(row => row._id), [first.body.message._id, second.body.message._id]);
  assert.ok(Number.isFinite(new Date(messages[0].createdAt).getTime()));
  assert.doesNotMatch(JSON.stringify(messages), /senderId|email|password|authVersion/);
  assert.equal((await view(customer, booking._id)).body.conversation.unreadCount, 1);
  assert.equal((await view(owner, booking._id)).body.conversation.unreadCount, 1);
  assert.equal((await send(customer, booking._id, "Hello", randomUUID(), { senderRole: "vendor" })).status, 400);
  const currentBooking = await Booking.findById(booking._id).lean();
  assert.deepEqual(currentBooking, initialBooking);
  assert.equal(await NotificationOutbox.countDocuments({ eventType: "message_received" }), 2);
});

test("concurrent retries persist one message and one alert; changed retry text conflicts even after closure", async () => {
  const { customer, owner, booking } = await fixture();
  const key = randomUUID();
  const results = await Promise.all(Array.from({ length: 5 }, () => send(customer, booking._id, "One delivery", key)));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 200, 200, 200, 201]);
  assert.equal(new Set(results.map(result => result.body.message._id)).size, 1);
  assert.equal(await Message.countDocuments(), 1);
  assert.equal(await NotificationOutbox.countDocuments(), 1);
  assert.equal((await view(owner, booking._id)).body.conversation.unreadCount, 1);
  assert.equal((await send(customer, booking._id, "Different", key)).status, 409);
  await Booking.updateOne({ _id: booking._id }, { $set: { status: "cancelled" } });
  const replay = await send(customer, booking._id, "One delivery", key);
  assert.equal(replay.status, 200, replay.body.message);
  assert.equal(replay.body.message._id, results[0].body.message._id);
  assert.equal((await send(customer, booking._id, "Another message")).status, 409);
  assert.equal(await Message.countDocuments(), 1);
  assert.equal(await NotificationOutbox.countDocuments(), 1);
});

test("simultaneous sends from both participants have unique ordered sequences and correctly counted unread messages", async () => {
  const { customer, owner, booking } = await fixture();
  const responses = await Promise.all(Array.from({ length: 8 }, (_, index) => send(index % 2 ? owner : customer, booking._id, `Message ${index}`)));
  for (const response of responses) assert.equal(response.status, 201, response.body.message);
  const rows = await Message.find().sort({ sequence: 1 }).lean();
  assert.deepEqual(rows.map(row => row.sequence), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(new Set(rows.map(row => String(row._id))).size, 8);
  const conversation = await Conversation.findOne().lean();
  assert.equal(conversation.customerUnreadCount, 4);
  assert.equal(conversation.vendorUnreadCount, 4);
  assert.equal(await NotificationOutbox.countDocuments(), 2);
});

test("message retry keys are scoped to sender and conversation rather than another participant's intent", async () => {
  const { customer, owner, vendor, booking } = await fixture();
  const another = await Booking.create({ customerId: customer._id, vendorId: vendor._id, eventType: "Wedding",
    eventDate: new Date(`${day()}T00:00:00.000Z`), eventLocation: "Another event hall", description: "Separate booking." });
  const key = randomUUID();
  const first = await send(customer, booking._id, "Customer intent", key);
  const second = await send(owner, booking._id, "Vendor intent", key);
  const third = await send(customer, another._id, "Separate booking intent", key);
  for (const response of [first, second, third]) assert.equal(response.status, 201, response.body.message);
  assert.equal(new Set([first, second, third].map(response => response.body.message._id)).size, 3);
  assert.equal(await Conversation.countDocuments(), 2);
});

test("read markers only advance the reader cursor, reject future messages and preserve peer receipts", async () => {
  const { customer, owner, booking } = await fixture();
  await send(customer, booking._id, "Question one");
  await send(owner, booking._id, "Answer one");
  await send(customer, booking._id, "Question two");
  const initial = await read(owner, booking._id, 1);
  assert.equal(initial.status, 200, initial.body.message);
  assert.equal(initial.body.conversation.selfReadSequence, 1);
  assert.equal(initial.body.conversation.unreadCount, 1);
  const replay = await read(owner, booking._id, 0);
  assert.equal(replay.body.conversation.selfReadSequence, 1);
  assert.equal(replay.body.conversation.readAt, initial.body.conversation.readAt);
  assert.equal((await read(owner, booking._id, 99)).status, 400);
  assert.equal((await read(customer, booking._id, 3)).body.conversation.unreadCount, 0);
  const peer = (await view(owner, booking._id)).body.conversation;
  assert.equal(peer.peerReadSequence, 3);
  assert.ok(peer.peerReadAt);
});

test("a simultaneous send and read receipt retain newly unread messages", async () => {
  const { customer, owner, booking } = await fixture();
  await send(customer, booking._id, "First unread message");
  const [receipt, second] = await Promise.all([read(owner, booking._id, 1), send(customer, booking._id, "Arrives during read")]);
  assert.equal(receipt.status, 200, receipt.body.message);
  assert.equal(second.status, 201, second.body.message);
  const stored = await Conversation.findOne().lean();
  assert.equal(stored.vendorReadSequence, 1);
  assert.equal(stored.vendorUnreadCount, 1);
  assert.equal((await view(owner, booking._id)).body.conversation.unreadCount, 1);
});

test("history pagination and reconnect catch-up use stable sequence cursors without overlaps or missing messages", async () => {
  const { customer, booking } = await fixture();
  for (let index = 1; index <= 7; index++) assert.equal((await send(customer, booking._id, `Message ${index}`)).status, 201);
  const latest = await history(customer, booking._id, { limit: 3 });
  assert.deepEqual(latest.body.messages.map(row => row.sequence), [5, 6, 7]);
  assert.equal(latest.body.pagination.hasMore, true);
  const older = await history(customer, booking._id, { before: latest.body.pagination.nextBefore, limit: 3 });
  assert.deepEqual(older.body.messages.map(row => row.sequence), [2, 3, 4]);
  const first = await history(customer, booking._id, { before: older.body.pagination.nextBefore, limit: 3 });
  assert.deepEqual(first.body.messages.map(row => row.sequence), [1]);
  assert.equal(first.body.pagination.hasMore, false);
  const after = await history(customer, booking._id, { after: 2, limit: 2 });
  assert.deepEqual(after.body.messages.map(row => row.sequence), [3, 4]);
  assert.equal(after.body.pagination.nextAfter, 4);
  const caughtUp = await history(customer, booking._id, { after: 4, limit: 50 });
  assert.deepEqual(caughtUp.body.messages.map(row => row.sequence), [5, 6, 7]);
  assert.equal(caughtUp.body.pagination.hasMore, false);
  for (const query of [{ limit: 0 }, { limit: 51 }, { limit: "x" }, { before: 0 }, { after: -1 }, { before: 3, after: 0 }, { "after[$ne]": 0 }, { limit: [1, 2] }])
    assert.equal((await history(customer, booking._id, query)).status, 400);
});

test("unverified and unavailable accounts cannot send while active participants retain authorized history", async () => {
  const { customer, owner, booking } = await fixture();
  await send(owner, booking._id, "Please review the details.");
  await User.updateOne({ _id: customer._id }, { $set: { emailVerifiedAt: null } });
  assert.equal((await history(customer, booking._id)).status, 200);
  assert.equal((await view(customer, booking._id)).body.conversation.canSend, false);
  assert.equal((await read(customer, booking._id, 1)).status, 200);
  const blocked = await send(customer, booking._id);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, "EMAIL_VERIFICATION_REQUIRED");
  assert.equal((await init(customer, booking._id)).status, 403);
  await User.updateOne({ _id: customer._id }, { $set: { emailVerifiedAt: new Date() } });
  await User.updateOne({ _id: owner._id }, { $set: { suspendedAt: new Date() } });
  assert.equal((await view(customer, booking._id)).status, 200);
  assert.equal((await view(customer, booking._id)).body.conversation.canSend, false);
  assert.equal((await send(customer, booking._id)).status, 403);
  assert.equal((await send(owner, booking._id)).status, 403);
  assert.equal(await Message.countDocuments(), 1);
});

test("terminal bookings retain conversation history and receipts but reject new messages or initialization", async () => {
  const { customer, owner, booking } = await fixture();
  await send(customer, booking._id, "A retained coordination message");
  for (const status of ["completed", "rejected", "cancelled"]) {
    await Booking.updateOne({ _id: booking._id }, { $set: { status } });
    assert.equal((await history(customer, booking._id)).status, 200);
    assert.equal((await view(owner, booking._id)).body.conversation.canSend, false);
    assert.equal((await send(owner, booking._id)).status, 409);
    assert.equal((await init(customer, booking._id)).status, 409);
    assert.equal((await read(owner, booking._id, 1)).status, 200);
  }
  await Booking.updateOne({ _id: booking._id }, { $set: { status: "accepted" } });
  assert.equal((await send(owner, booking._id, "Accepted coordination remains available")).status, 201);
});

test("a booking closure that wins after the initial eligibility read prevents a later message commit", async () => {
  const { customer, booking } = await fixture();
  const original = User.findOneAndUpdate;
  let closed = false;
  // Close through the real status endpoint after messaging has read eligibility,
  // before it has acquired its first account write. The message's snapshot still
  // sees pending; only contention on the booking document detects this race.
  mock.method(User, "findOneAndUpdate", async function (...args) {
    if (!closed) {
      closed = true;
      const cancellation = await request(app).patch(`${route(booking._id)}/status`).set("Authorization", auth(customer)).send({ status: "cancelled" });
      assert.equal(cancellation.status, 200, cancellation.body.message);
    }
    return original.apply(this, args);
  });
  const result = await send(customer, booking._id, "Must not arrive after cancellation");
  assert.equal(result.status, 409, result.body.message);
  assert.equal((await Booking.findById(booking._id)).status, "cancelled");
  assert.equal(await Message.countDocuments(), 0);
  assert.equal(await Conversation.countDocuments(), 0);
  assert.equal(await NotificationOutbox.countDocuments({ eventType: "message_received" }), 0);
});

test("new booking messaging never reads, indexes or rewrites retired chat collections", async () => {
  const { customer, booking } = await fixture();
  const retiredConversations = mongoose.connection.collection("conversations");
  const retiredMessages = mongoose.connection.collection("messages");
  await retiredConversations.insertOne({ participants: ["old-user"], unrelated: "preserve retired conversation" });
  await retiredMessages.insertOne({ conversation: "old-format", content: "Preserve retired message" });
  const beforeConversations = await retiredConversations.find().toArray();
  const beforeMessages = await retiredMessages.find().toArray();
  assert.equal(Conversation.collection.name, "bookingconversations");
  assert.equal(Message.collection.name, "bookingmessages");
  assert.equal((await send(customer, booking._id, "A new booking message")).status, 201);
  const response = await history(customer, booking._id);
  assert.deepEqual(response.body.messages.map(row => row.body), ["A new booking message"]);
  assert.deepEqual(await retiredConversations.find().toArray(), beforeConversations);
  assert.deepEqual(await retiredMessages.find().toArray(), beforeMessages);
  assert.equal((await retiredConversations.listIndexes().toArray()).length, 1);
  assert.equal((await retiredMessages.listIndexes().toArray()).length, 1);
});

test("unread summaries scope counts to owned bookings and cannot disclose another conversation", async () => {
  const { customer, owner, stranger, booking } = await fixture();
  await send(customer, booking._id);
  const result = await unread(owner, String(booking._id));
  assert.equal(result.status, 200, result.body.message);
  assert.deepEqual(result.body.unreadCounts, { [String(booking._id)]: 1 });
  assert.equal(result.body.totalUnread, 1);
  assert.deepEqual((await unread(stranger)).body.unreadCounts, {});
  assert.equal((await unread(stranger, String(booking._id))).status, 403);
  assert.equal((await unread(owner, "invalid")).status, 400);
  assert.equal((await unread(owner, Array.from({ length: 101 }, () => new mongoose.Types.ObjectId().toString()).join(","))).status, 400);
  await read(owner, booking._id, 1);
  assert.equal((await unread(owner)).body.totalUnread, 0);
});

test("a failed durable alert rolls back the message, sequence and conversation and publishes no hint", async () => {
  const { customer, booking } = await fixture();
  const hints = [];
  const stop = onMessagingEvent(event => hints.push(event));
  const key = randomUUID();
  mock.method(NotificationOutbox, "create", async () => { throw new Error("Outbox unavailable"); });
  try {
    const response = await send(customer, booking._id, "Private message that must not be logged", key);
    assert.equal(response.status, 500);
    assert.equal(await Message.countDocuments(), 0);
    assert.equal(await Conversation.countDocuments(), 0);
    assert.equal(await NotificationOutbox.countDocuments(), 0);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(hints.length, 0);
    mock.restoreAll();
    assert.equal((await send(customer, booking._id, "Private message that must not be logged", key)).status, 201);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(hints.length, 1);
    assert.equal(hints[0].type, "message:new");
  } finally { stop(); }
});

test("message storage is append-only and participant mismatches never expose retained history", async () => {
  const { customer, stranger, booking } = await fixture();
  const response = await send(customer, booking._id);
  const message = await Message.findById(response.body.message._id);
  await assert.rejects(Message.updateOne({ _id: message._id }, { $set: { body: "Changed" } }), /append-only/);
  await assert.rejects(Message.deleteOne({ _id: message._id }), /append-only/);
  message.body = "Changed";
  await assert.rejects(message.save(), /append-only/);
  await Conversation.collection.updateOne({ bookingId: booking._id }, { $set: { customerId: stranger._id } });
  assert.equal((await history(customer, booking._id)).status, 409);
  assert.equal((await history(stranger, booking._id)).status, 403);
});

test("live credential-version changes fence service writes and each sender has a bounded rate budget", async () => {
  const { customer, booking } = await fixture();
  await User.updateOne({ _id: customer._id }, { $inc: { authVersion: 1 } });
  await assert.rejects(sendMessage(String(booking._id), customer, { body: "Stale session", clientMessageId: randomUUID() }), { statusCode: 401 });
  assert.equal(await Message.countDocuments(), 0);
  for (let index = 0; index < 30; index++) consumeMessagingRate("rate-test", "send");
  assert.throws(() => consumeMessagingRate("rate-test", "send"), { statusCode: 429 });
  assert.doesNotThrow(() => consumeMessagingRate("another-account", "send"));
});
