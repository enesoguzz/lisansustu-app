import { alesSummary, gpaSummary, languageSummary, quotaSummary, type ListingDetails } from "@lisansustu/core";

const dash = <span className="text-navy-muted/60">-</span>;

/** İlan tablolarındaki şart sütunları: kontenjan, ALES, not ortalaması, yabancı dil. */
export function RequirementCells({ details, accepting }: { details: ListingDetails; accepting: boolean }) {
  if (!accepting) {
    return (
      <td colSpan={4} className="px-3 py-2 text-navy-muted">
        Bu dönem öğrenci alınmıyor
      </td>
    );
  }
  return (
    <>
      <td className="px-3 py-2">{quotaSummary(details.quota) || dash}</td>
      <td className="px-3 py-2">{alesSummary(details.ales) || dash}</td>
      <td className="px-3 py-2">{gpaSummary(details.gpa) || dash}</td>
      <td className="max-w-56 truncate px-3 py-2" title={languageSummary(details.language)}>
        {languageSummary(details.language) || dash}
      </td>
    </>
  );
}

export function RequirementHeads() {
  return (
    <>
      <th className="px-3 py-2">Kontenjan</th>
      <th className="px-3 py-2">ALES</th>
      <th className="px-3 py-2">Not ort.</th>
      <th className="px-3 py-2">Yabancı dil</th>
    </>
  );
}
