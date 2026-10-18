import Button from "./Button";
export default function Pagination({
  pagination = {},
  page,
  onPage,
  disabled = false
}) {
  const pages = pagination.pages || pagination.totalPages || 1;
  return <div className="mt-6 flex items-center justify-center gap-4">
    <Button variant="outline" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
    <span className="text-sm">Page {page} of {pages}</span>
    <Button variant="outline" disabled={disabled || page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
  </div>;
}
