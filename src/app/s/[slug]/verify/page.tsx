export default async function SurveyVerifyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-gray-900">Verify Attestation</h1>
      <p className="mt-4 text-gray-600">Slug: {slug}</p>
    </div>
  );
}
