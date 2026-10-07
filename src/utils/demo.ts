import config from "../config/index.js";

export const isProtectedDemoAccount = (email: string) =>
	config.demo.protectAccounts && config.demo.emails.includes(email.trim().toLowerCase());
