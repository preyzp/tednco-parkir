import { redirect } from "next/navigation";
import { LOGIN_PATH } from "../lib/login";

export default function Home() {
  redirect(LOGIN_PATH);
}
