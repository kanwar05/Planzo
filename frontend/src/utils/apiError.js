export const getApiError = (error, fallback = "Something went wrong.") => {
  const data = error.response?.data;

  if (data?.errors) {
    const details = Array.isArray(data.errors.missingFields)
      ? data.errors.missingFields.join(", ")
      : Object.values(data.errors).join(" ");

    return details ? `${data.message} ${details}` : data.message;
  }

  return data?.message || error.message || fallback;
};
