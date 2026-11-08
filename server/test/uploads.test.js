import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { Writable } from "node:stream";
import express from "express";
import request from "supertest";
import cloudinary from "../src/config/cloudinary.js";
import { errorHandler } from "../src/middleware/errorMiddleware.js";
import { uploadVendorImages, uploadProfileImage, uploadCoverImage, uploadPortfolioImages } from "../src/middleware/upload.js";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lN8AAAAASUVORK5CYII=", "base64");
const originalUpload = cloudinary.uploader.upload_stream;
const originalDestroy = cloudinary.uploader.destroy;
const envNames = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];
const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
let uploads;
let destroyed;
let providerError;
let providerStreamError;

const app = express();
for (const [path, upload] of [["/profile", uploadProfileImage], ["/cover", uploadCoverImage], ["/photos", uploadVendorImages], ["/portfolio", uploadPortfolioImages]]) {
  app.post(path, upload, (req, res) => res.json({ file: req.file, files: req.files }));
}
app.use(errorHandler);

beforeEach(() => {
  for (const name of envNames) process.env[name] = "upload-test-placeholder";
  uploads = [];
  destroyed = [];
  providerError = false;
  providerStreamError = false;
  cloudinary.uploader.upload_stream = (options, callback) => {
    const upload = { options, bytes: 0 };
    uploads.push(upload);
    return new Writable({
      write(chunk, encoding, done) {
        upload.bytes += chunk.length;
        if (providerStreamError) done(new Error("Mock hosting stream failed"));
        else done();
      },
      final(done) {
        setImmediate(() => {
          if (providerError) callback(new Error("Mock image decode failed"));
          else callback(null, {
            public_id: options.public_id,
            secure_url: `https://res.cloudinary.com/upload-test/image/upload/${options.public_id}.png`,
            bytes: upload.bytes,
          });
          done();
        });
      },
    });
  };
  cloudinary.uploader.destroy = async (publicId, options) => {
    destroyed.push({ publicId, options });
    return { result: "ok" };
  };
});

afterEach(() => {
  cloudinary.uploader.upload_stream = originalUpload;
  cloudinary.uploader.destroy = originalDestroy;
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
});

test("profile and cover uploads stream to decoded image hosting and retain controller metadata", async () => {
  for (const [endpoint, field, folder] of [["/profile", "profileImage", "profile"], ["/cover", "coverImage", "cover"]]) {
    const response = await request(app).post(endpoint).attach(field, png, { filename: "photo.png", contentType: "image/png" });
    assert.equal(response.status, 200);
    assert.equal(response.body.file.size, png.length);
    assert.equal(response.body.file.filename, uploads.at(-1).options.public_id);
    assert.match(response.body.file.filename, new RegExp(`^eventifyy/vendors/${folder}/[a-f0-9-]{36}$`));
    assert.match(response.body.file.path, /^https:\/\/res\.cloudinary\.com\//);
    assert.equal(uploads.at(-1).options.resource_type, "image");
    assert.deepEqual(uploads.at(-1).options.allowed_formats, ["jpg", "jpeg", "png", "webp"]);
    assert.equal(uploads.at(-1).options.overwrite, false);
  }
  assert.equal(destroyed.length, 0);
});

test("business photos preserve existing multipart fields and portfolio array output", async () => {
  const response = await request(app).post("/photos")
    .attach("profileImage", png, "photo.png")
    .attach("coverImage", png, "cover.png")
    .attach("portfolioImages", png, "business.png");
  assert.equal(response.status, 200);
  assert.equal(response.body.files.profileImage.length, 1);
  assert.equal(response.body.files.coverImage.length, 1);
  assert.equal(response.body.files.portfolioImages.length, 1);
  assert.match(response.body.files.portfolioImages[0].filename, /^eventifyy\/vendors\/portfolioImages\//);
  const portfolio = await request(app).post("/portfolio").attach("images", png, "image.png");
  assert.equal(portfolio.status, 200);
  assert.equal(portfolio.body.files.length, 1);
  assert.match(portfolio.body.files[0].filename, /^eventifyy\/vendors\/portfolio\//);
});

test("invalid extensions, MIME mismatches and unexpected file fields never reach Cloudinary", async () => {
  for (const [field, filename, contentType] of [
    ["profileImage", "photo.svg", "image/svg+xml"],
    ["profileImage", "photo.png", "image/jpeg"],
    ["profileImage", "file.exe", "image/png"],
    ["otherImage", "photo.png", "image/png"],
  ]) {
    const response = await request(app).post("/profile").attach(field, png, { filename, contentType });
    assert.equal(response.status, 400);
  }
  assert.equal(uploads.length, 0);
  assert.equal(destroyed.length, 0);
});

test("files above 5MB fail and any partially uploaded image is cleaned up", async () => {
  const response = await request(app).post("/profile").attach("profileImage", Buffer.alloc(5 * 1024 * 1024 + 1), { filename: "large.png", contentType: "image/png" });
  assert.equal(response.status, 400);
  assert.match(response.body.message, /5MB/);
  assert.equal(uploads.length, 1);
  assert.equal(destroyed.length, 1);
  assert.equal(destroyed[0].publicId, uploads[0].options.public_id);
  assert.equal(destroyed[0].options.resource_type, "image");
});

test("multipart text fields cannot control deletion targets and trigger cleanup of this request's own uploads", async () => {
  const response = await request(app).post("/photos")
    .attach("profileImage", png, "photo.png")
    .field("publicId", "another-vendor/private-photo");
  assert.equal(response.status, 400);
  assert.equal(uploads.length, 1);
  assert.equal(destroyed.length, 1);
  assert.equal(destroyed[0].publicId, uploads[0].options.public_id);
  assert.notEqual(destroyed[0].publicId, "another-vendor/private-photo");
});

test("duplicate multipart image fields fail and remove earlier successful uploads", async () => {
  const response = await request(app).post("/photos")
    .attach("profileImage", png, "first.png")
    .attach("profileImage", png, "second.png");
  assert.equal(response.status, 400);
  assert.equal(uploads.length, 1);
  assert.equal(destroyed.length, 1);
  assert.equal(destroyed[0].publicId, uploads[0].options.public_id);
});

test("portfolio file count is limited to eight and all files from rejected requests are cleaned up", async () => {
  let upload = request(app).post("/portfolio");
  for (let index = 0; index < 9; index += 1) upload = upload.attach("images", png, `${index}.png`);
  const response = await upload;
  assert.equal(response.status, 400);
  assert.equal(uploads.length, 8);
  assert.deepEqual(destroyed.map((entry) => entry.publicId).sort(), uploads.map((entry) => entry.options.public_id).sort());
});

test("provider decode errors and writable stream errors fail cleanly and remove only allocated image IDs", async () => {
  for (const mode of ["decode", "stream"]) {
    providerError = mode === "decode";
    providerStreamError = mode === "stream";
    const response = await request(app).post("/profile").attach("profileImage", png, "photo.png");
    assert.equal(response.status, 502);
    assert.match(response.body.message, /could not be uploaded/i);
    assert.equal(destroyed.at(-1).publicId, uploads.at(-1).options.public_id);
  }
  assert.equal(destroyed.length, 2);
});

test("missing hosting configuration returns a useful error before uploading", async () => {
  delete process.env.CLOUDINARY_API_SECRET;
  const response = await request(app).post("/profile").attach("profileImage", png, "photo.png");
  assert.equal(response.status, 503);
  assert.equal(uploads.length, 0);
});

test("malformed provider responses cannot redirect cleanup to somebody else's asset", async () => {
  let allocated;
  cloudinary.uploader.upload_stream = (options, callback) => {
    allocated = options.public_id;
    return new Writable({
      write(chunk, encoding, done) { done(); },
      final(done) {
        callback(null, { public_id: "another-vendor/private-photo", secure_url: "https://res.cloudinary.com/unexpected.png", bytes: png.length });
        done();
      },
    });
  };
  const response = await request(app).post("/profile").attach("profileImage", png, "photo.png");
  assert.equal(response.status, 502);
  assert.deepEqual(destroyed.map((entry) => entry.publicId), [allocated]);
});

test("a disconnected client cleans up pending uploads and late provider results", { timeout: 5000 }, async () => {
  let start;
  let cleanup;
  let complete;
  const started = new Promise((resolve) => { start = resolve; });
  const cleaned = new Promise((resolve) => { cleanup = resolve; });
  cloudinary.uploader.upload_stream = (options, callback) => new Writable({
    write(chunk, encoding, done) { done(); },
    final(done) {
      complete = () => {
        callback(null, { public_id: options.public_id, secure_url: "https://res.cloudinary.com/photo.png", bytes: png.length });
        done();
      };
      start(options.public_id);
    },
  });
  cloudinary.uploader.destroy = async (publicId) => { destroyed.push({ publicId }); cleanup(); return { result: "ok" }; };
  const server = app.listen(0);
  try {
    const upload = request(server).post("/profile").attach("profileImage", png, "photo.png");
    const settled = upload.then(() => null, (error) => error);
    const allocated = await started;
    upload.abort();
    assert.ok(await settled);
    await cleaned;
    complete();
    await new Promise(setImmediate);
    assert.deepEqual(destroyed.map((entry) => entry.publicId), [allocated, allocated]);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
