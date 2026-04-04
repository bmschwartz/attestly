import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    // do something
  }

  return (
    <HydrateClient>
      <main>
        <div></div>
      </main>
    </HydrateClient>
  );
}
