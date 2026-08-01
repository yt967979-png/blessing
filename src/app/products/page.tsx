import { redirect } from 'next/navigation';

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProductsRedirectPage({ searchParams }: Props) {
  const params = (await searchParams) || {};
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      query.set(key, value);
    } else if (Array.isArray(value)) {
      for (const val of value) {
        query.append(key, val);
      }
    }
  }

  const queryString = query.toString();
  redirect(queryString ? `/search?${queryString}` : '/search');
}
