import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  for (const user of users) {
    if (user.password && !user.password.startsWith("$2")) {
      const hashed = await bcrypt.hash(user.password, 12);
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashed },
      });
      console.log(`Hashed password for ${user.username}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
