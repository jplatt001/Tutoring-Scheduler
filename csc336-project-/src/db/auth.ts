import argon2, { type Options as ArgonOptions } from "argon2";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { pool } from "@/db/index";

// As per OWASP recommendations:
// https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
const ARGON_OPTIONS: ArgonOptions = {
	type: argon2.argon2id,
	memoryCost: 2 ** 16,
	timeCost: 2,
	parallelism: 1,
	hashLength: 32,
	secret: process.env.SECRET_KEY
		? Buffer.from(process.env.SECRET_KEY)
		: undefined,
};

export interface UserWithHash extends RowDataPacket {
	id: number;
	first_name: string;
	last_name: string;
	email: string;
	password_hash: string;
}

export type User = Pick<
	UserWithHash,
	"id" | "first_name" | "last_name" | "email"
>;

/**
 * Attempt to retrieve user with given password and password.
 *
 * @returns `User` struct if the combination exists, `undefined` if not
 */
export async function getUser(
	email: string,
	password: string,
): Promise<User | null> {
	const [res] = await pool.execute<UserWithHash[]>(
		`SELECT
            id,
            first_name,
            last_name,
            email,
            password_hash
        FROM user
        WHERE user.email = :email`,
		{ email },
	);

	if (res.length !== 1) {
		return null;
	}

	const user = res[0];

	if (await argon2.verify(user.password_hash, password, ARGON_OPTIONS)) {
		return {
			id: user.id,
			first_name: user.first_name,
			last_name: user.last_name,
			email: user.email,
		};
	}

	return null;
}

/**
 * Creates a user with the given parameters.
 *
 * @returns id of newly created user
 */
export async function createUser(
	first_name: string,
	last_name: string,
	email: string,
	password: string,
): Promise<number | null> {
	const hash = await argon2.hash(password, ARGON_OPTIONS);

	try {
		const [res] = await pool.execute<ResultSetHeader>(
			`INSERT INTO bookings_db.user (first_name, last_name, email, password_hash)
            VALUES (:first_name, :last_name, :email, :hash)`,
			{ first_name, last_name, email, hash },
		);

		return res.insertId;
	} catch (e) {
		return null;
	}
}
