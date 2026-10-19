import Button from "./Button";
export default function Pagination({
  pagination = {},
  page,
  onPage,
  disabled = false
}) {
  const pages = pagination.pages || pagination.totalPages || 1;
  return <div className="mt-6 flex flex-wrap items-center justify-center gap-2 sm:gap-4">
    <Button variant="outline" className="!px-4 !text-xs" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
    <span className="text-xs">Page {page} of {pages}</span>
    <Button variant="outline" className="!px-4 !text-xs" disabled={disabled || page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
  </div>;
}
