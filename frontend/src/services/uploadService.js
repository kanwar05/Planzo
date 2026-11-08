import { api } from "./api";
export const uploadPortfolioImages = async files => {
  const data = new FormData();
  files.forEach(file => data.append("images", file));
  return (await api.post("/vendors/portfolio", data, {
    timeout: 120000
  })).data.vendor;
};
export const deletePortfolioImage = async imageUrl => (await api.delete("/vendors/portfolio", {
  data: {
    imageUrl
  }
})).data.vendor;

const uploadSingleImage = async (path, field, file) => {
  const data = new FormData();
  data.append(field, file);
  return (await api.put(path, data, { timeout: 120000 })).data.vendor;
};
export const uploadProfileImage = file => uploadSingleImage("/vendors/profile-image", "profileImage", file);
export const uploadCoverImage = file => uploadSingleImage("/vendors/cover-image", "coverImage", file);
export const deleteProfileImage = async () => (await api.delete("/vendors/profile-image")).data.vendor;
export const deleteCoverImage = async () => (await api.delete("/vendors/cover-image")).data.vendor;
