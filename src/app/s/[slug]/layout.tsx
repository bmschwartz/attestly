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
  const isEditPage = pathname.includes("/edit");
  const isVerifyPage = pathname.endsWith("/verify");
  const isResultsPage = pathname.endsWith("/results");
  const skipCheck = isConfirmationPage || isEditPage || isVerifyPage || isResultsPage;

  // Only check for submitted response on the respond/landing pages
  const { data: confirmation } = api.response.getConfirmation.useQuery(
    { slug: params.slug },
    {
      enabled: authenticated && !skipCheck,
      retry: false,
    },
  );

  useEffect(() => {
    if (confirmation && !skipCheck) {
      router.replace(`/s/${params.slug}/confirmation`);
    }
  }, [confirmation, isConfirmationPage, router, params.slug]);

  return <>{children}</>;
}
