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
