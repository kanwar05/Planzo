import { api } from "./api";

const toReviewFormData = (data) => {
  const formData = new FormData();
  formData.append("rating", String(data.rating));
  formData.append("comment", data.comment);

  if (data.bookingId) formData.append("bookingId", data.bookingId);
  if (data.removeImagePublicIds?.length) {
    formData.append(
      "removeImagePublicIds",
      JSON.stringify(data.removeImagePublicIds),
    );
  }
  (data.images || []).forEach((image) => formData.append("images", image));

  return formData;
};

const toReviewPayload = (data) => {
  if (data.images?.length || data.removeImagePublicIds?.length) {
    return toReviewFormData(data);
  }

  return {
    bookingId: data.bookingId,
    rating: data.rating,
    comment: data.comment,
  };
};

export const createReview = async (data) => {
  const response = await api.post("/reviews", toReviewPayload(data), {
    timeout: 120000,
  });
  return response.data.review;
};

export const getVendorReviews = async (vendorId, params = {}) => {
  const response = await api.get(`/vendors/${vendorId}/reviews`, { params });
  return response.data;
};

export const getBookingReview = async (bookingId) => {
  const response = await api.get(`/bookings/${bookingId}/review`);
  return response.data.review;
};

export const updateReview = async (id, data) => {
  const response = await api.patch(`/reviews/${id}`, toReviewPayload(data), {
    timeout: 120000,
  });
  return response.data.review;
};

export const deleteReview = async (id) => {
  await api.delete(`/reviews/${id}`);
};

export const replyToReview = async (id, message) => {
  const response = await api.patch(`/reviews/${id}/reply`, { message });
  return response.data.review;
};
