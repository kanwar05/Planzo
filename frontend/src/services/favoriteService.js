import { api } from "./api";

export const addFavorite = async (vendorId) => {
  const response = await api.post(`/favorites/${vendorId}`);
  return response.data;
};

export const removeFavorite = async (vendorId) => {
  const response = await api.delete(`/favorites/${vendorId}`);
  return response.data;
};

export const getFavorites = async () => {
  const response = await api.get("/favorites");
  return response.data.favorites;
};

export const checkFavorite = async (vendorId) => {
  const response = await api.get(`/favorites/check/${vendorId}`);
  return response.data.isFavorited;
};
