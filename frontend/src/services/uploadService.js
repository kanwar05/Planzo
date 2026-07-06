import { api } from "./api";

export const uploadPortfolioImages = async (files) => {
  const formData = new FormData();

  files.forEach((file) => formData.append("images", file));

  const response = await api.post("/vendors/portfolio", formData, {
    timeout: 120000,
  });

  return response.data.vendor;
};

export const uploadVerificationDocuments = async (files) => {
  const formData = new FormData();

  files.forEach((file) => formData.append("documents", file));

  const response = await api.post("/vendors/verification-documents", formData, {
    timeout: 120000,
  });

  return response.data.vendor;
};

export const deletePortfolioImage = async (imageUrl) => {
  const response = await api.delete("/vendors/portfolio", {
    data: { imageUrl },
  });

  return response.data.vendor;
};
