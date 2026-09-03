import { prisma } from "../src/lib/db";
import { seedDemoWorkspace } from "../src/server/seedDemo";

async function main() {
  console.log("Seeding demo workspace…");
  const result = await seedDemoWorkspace(prisma);
  console.log("Demo workspace ready.");
  console.log(`  Owner:        ${result.owner.email} / ${result.owner.password}`);
  console.log(`  Photographer: ${result.photographer.email} / ${result.photographer.password}`);
  console.log(`  Admin:        ${result.admin.email} / ${result.admin.password}`);
  console.log(`  Partner:      ${result.partner.email} / ${result.partner.password}`);
  console.log(`  Client:       ${result.client.email} / ${result.client.password}`);
  console.log(`  Booking page: ${result.bookingPage}`);
  console.log(
    `  Second org for the owner: ${result.otherOrg.name} (${result.otherOrg.handle}) — client "${result.otherOrg.confidentialClient}" must never be visible from alex-photo`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
