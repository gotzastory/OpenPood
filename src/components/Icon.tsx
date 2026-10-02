export function Icon({ svg }: { svg: string }) {
  return <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}
