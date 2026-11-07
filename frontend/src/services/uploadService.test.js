import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { deleteCoverImage, deleteProfileImage, uploadCoverImage, uploadProfileImage } from "./uploadService";

vi.mock("./api", () => ({ api: { put: vi.fn(), delete: vi.fn() } }));

describe("owner profile and cover photo requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.put.mockResolvedValue({ data: { vendor: { _id: "mine" } } });
    api.delete.mockResolvedValue({ data: { vendor: { _id: "mine" } } });
  });

  it.each([[uploadProfileImage, "/vendors/profile-image", "profileImage"], [uploadCoverImage, "/vendors/cover-image", "coverImage"]])("sends one file under the existing multipart field", async (upload, path, field) => {
    const file = new File(["image"], "business.webp", { type: "image/webp" });
    expect(await upload(file)).toEqual({ _id: "mine" });
    const [endpoint, data, options] = api.put.mock.calls[0];
    expect(endpoint).toBe(path);
    expect([...data.keys()]).toEqual([field]);
    expect(data.get(field)).toBe(file);
    expect(options).toEqual({ timeout: 120000 });
  });

  it("uses owner-scoped deletion endpoints without client-controlled asset targets", async () => {
    await deleteProfileImage();
    await deleteCoverImage();
    expect(api.delete.mock.calls).toEqual([["/vendors/profile-image"], ["/vendors/cover-image"]]);
  });
});
