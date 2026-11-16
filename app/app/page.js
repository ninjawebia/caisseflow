import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionUser } from "../lib/auth";

export default async function Home() {
  const user = await getSessionUser(await cookies());
  redirect(user ? "/dashboard" : "/login");
}
