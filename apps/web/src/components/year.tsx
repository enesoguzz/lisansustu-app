async function getYear() {
  "use cache";
  return new Date().getFullYear();
}

export async function Year() {
  return <>{await getYear()}</>;
}
