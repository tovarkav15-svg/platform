// Аккаунты основателей. Запуск: npm run db:seed
// Пароли берутся из .env (он не попадает в git), в коде их нет.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

process.loadEnvFile?.(".env");

const db = new PrismaClient();

const users = [
  {
    username: "fedonko",
    email: "fedonko@platforma.test",
    passwordEnv: "SEED_PASSWORD_FEDONKO",
    profile: {
      displayName: "Артём",
      bio: "Основатель платформы. Монтаж и продюсирование.",
      niches: "montazh,producer",
      accent: "edit",
      earnings: 84500,
      earningsGoal: 150000,
    },
  },
  {
    username: "awiny",
    email: "awiny@platforma.test",
    passwordEnv: "SEED_PASSWORD_AWINY",
    profile: {
      displayName: "Awiny",
      bio: "Основатель платформы.",
      niches: "",
      accent: "vibe",
    },
  },
];

for (const u of users) {
  const password = process.env[u.passwordEnv];
  if (!password) {
    console.log(`Пропускаю @${u.username}: в .env нет ${u.passwordEnv}`);
    continue;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await db.user.findUnique({ where: { username: u.username } });
  if (existing) {
    // Профиль не перезаписываем, чтобы не потерять то, что человек уже настроил
    await db.user.update({ where: { id: existing.id }, data: { passwordHash, role: "founder" } });
  } else {
    await db.user.create({
      data: { username: u.username, email: u.email, passwordHash, role: "founder", profile: { create: u.profile } },
    });
  }
  console.log(`Готово: @${u.username}`);
}

await db.$disconnect();
