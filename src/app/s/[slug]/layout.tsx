"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { api } from "~/trpc/react";
import { useEffect } from "react";

/**
 * Layout for /s/[slug]/* routes.
 * If the user is authenticated and has already submitted a response to this survey,
 * redirect them to the confirmation page (unless they're already on it).
 */
export default function SurveySlugLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ slug: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { authenticated } = usePrivy();

  const isConfirmationPage = pathname.endsWith("/confirmation");

  // Only check if authenticated and not already on the confirmation page
  const { data: confirmation } = api.response.getConfirmation.useQuery(
    { slug: params.slug },
    {
      enabled: authenticated && !isConfirmationPage,
      retry: false,
    },
  );

  useEffect(() => {
    if (confirmation && !isConfirmationPage) {
      router.replace(`/s/${params.slug}/confirmation`);
    }
  }, [confirmation, isConfirmationPage, router, params.slug]);

  return <>{children}</>;
}
