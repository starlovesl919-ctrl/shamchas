import type { GatewayBill, GatewayConfig } from "../../src/types";
import {
	CURRENCY_IDS,
	RESULT_BILL_NO_ALREADY_EXISTS,
	ShamCashApiError,
	ShamCashConfigError,
	ShamCashCryptoError,
	STATUS_PAID,
	billStatusName,
	createBill,
	getBill,
	missingSettings,
	parseWebhook,
	readSettings,
} from "./client";
import type { ShamCashSettings, ShamCashWebhook } from "./client";
import { claimEvent, listBills, loadBill, saveBill } from "./store";

/**
 * Sham Cash gateway routes.
 *
 * - GET  /api/shamcash/config        connection state and webhook URL
 * - GET  /api/shamcash/bills         bills issued by this gateway
 * - POST /api/shamcash/bills         create a bill, returns its paymentUrl
 * - GET  /api/shamcash/bills/:billNo one bill, refreshed from Sham Cash
 * - POST /api/shamcash/webhook       encrypted paid / expired notification
 */

const BILLS_PATH = "/api/shamcash/bills";
const WEBHOOK_PATH = "/api/shamcash/webhook";
const CONFIG_PATH = "/api/shamcash/config";

const AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;

class HttpError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

export async function handleShamCashRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	const url = new URL(request.url);

	try {
		const settings = readSettings(env);
		const callbackUrl = `${publicBaseUrl(env, request)}${WEBHOOK_PATH}`;

		if (url.pathname === CONFIG_PATH) {
			requireMethod(request, "GET");

			const config: GatewayConfig = {
				configured: settings !== null,
				callbackUrl,
				missing: missingSettings(env),
			};

			return Response.json(config);
		}

		if (url.pathname === WEBHOOK_PATH) {
			requireMethod(request, "POST");

			return await handleWebhook(request, env, settings);
		}

		if (url.pathname === BILLS_PATH) {
			if (request.method === "GET") {
				return Response.json(await listBills(env.BILLS));
			}
			if (request.method === "POST") {
				return await handleCreateBill(request, env, settings, callbackUrl);
			}

			throw new HttpError(405, "هذا المسار يدعم GET و POST فقط.");
		}

		if (url.pathname.startsWith(`${BILLS_PATH}/`)) {
			requireMethod(request, "GET");

			return await handleBillStatus(
				env,
				settings,
				decodeURIComponent(url.pathname.slice(BILLS_PATH.length + 1)),
			);
		}

		return Response.json({ error: "المسار غير موجود." }, { status: 404 });
	} catch (error) {
		return errorResponse(error);
	}
}

async function handleCreateBill(
	request: Request,
	env: Env,
	settings: ShamCashSettings | null,
	callbackUrl: string,
): Promise<Response> {
	const body = await readJsonObject(request);
	const amount = normalizeAmount(body.amount);
	const currencyCode = normalizeCurrency(body.currency);
	const note = normalizeNote(body.note);
	const requestedBillNo = normalizeBillNo(body.billNo);

	if (!settings) {
		throw new ShamCashConfigError("مفاتيح شام كاش غير مهيّأة بعد.");
	}

	const billNo = requestedBillNo ?? generateBillNo();
	const existing = await loadBill(env.BILLS, billNo);
	if (existing && existing.paymentUrl !== "") {
		return Response.json(existing);
	}

	let bill: GatewayBill;
	try {
		bill = await createBill(settings, {
			billNo,
			amount,
			currencyId: CURRENCY_IDS[currencyCode],
			note,
			callbackUrl,
			redirectUrl: `${publicBaseUrl(env, request)}/?bill=${encodeURIComponent(billNo)}`,
		});
	} catch (error) {
		// A dropped response can still have created the bill; load it instead.
		if (
			error instanceof ShamCashApiError &&
			error.result === RESULT_BILL_NO_ALREADY_EXISTS
		) {
			bill = await getBill(settings, billNo);
		} else {
			throw error;
		}
	}

	if (bill.note === null && note !== "") bill.note = note;
	await saveBill(env.BILLS, bill);

	return Response.json(bill, { status: 201 });
}

async function handleBillStatus(
	env: Env,
	settings: ShamCashSettings | null,
	billNo: string,
): Promise<Response> {
	if (billNo === "") {
		throw new HttpError(400, "رقم الفاتورة مطلوب.");
	}

	const stored = await loadBill(env.BILLS, billNo);
	if (!settings) {
		if (!stored) throw new HttpError(404, "الفاتورة غير موجودة.");

		return Response.json(stored);
	}

	let bill: GatewayBill;
	try {
		bill = await getBill(settings, billNo);
	} catch (error) {
		if (error instanceof ShamCashApiError && stored !== null) {
			return Response.json(stored);
		}

		throw error;
	}

	bill.createdAt = stored?.createdAt ?? bill.createdAt;
	bill.note = stored?.note ?? bill.note;
	bill.paidAt = stored?.paidAt ?? bill.paidAt;
	bill.source = "refresh";
	await saveBill(env.BILLS, bill);

	return Response.json(bill);
}

async function handleWebhook(
	request: Request,
	env: Env,
	settings: ShamCashSettings | null,
): Promise<Response> {
	if (!settings) {
		return new Response("Sham Cash is not configured.", { status: 503 });
	}

	const rawBody = await request.text();

	let event: ShamCashWebhook;
	try {
		event = await parseWebhook(settings, rawBody);
	} catch (error) {
		if (error instanceof ShamCashCryptoError) {
			return new Response("Invalid ShamCash webhook.", { status: 400 });
		}

		throw error;
	}

	if (await claimEvent(env.BILLS, event.billNo, event.statusId)) {
		const stored = await loadBill(env.BILLS, event.billNo);
		if (stored) {
			const now = Date.now();
			stored.statusId = event.statusId;
			stored.statusName = billStatusName(event.statusId);
			stored.tranId = event.tranId ?? stored.tranId;
			stored.updatedAt = now;
			stored.source = "webhook";
			if (event.statusId === STATUS_PAID) stored.paidAt = now;
			await saveBill(env.BILLS, stored);
		}
	}

	// ShamCash retries until it receives HTTP 200 within ten seconds.
	return new Response("OK", {
		status: 200,
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
}

function publicBaseUrl(env: Env, request: Request): string {
	const configured = (env.PUBLIC_BASE_URL ?? "").trim();
	if (configured !== "") return configured.replace(/\/+$/, "");

	return new URL(request.url).origin;
}

function requireMethod(request: Request, method: string): void {
	if (request.method !== method) {
		throw new HttpError(405, `هذا المسار يدعم ${method} فقط.`);
	}
}

async function readJsonObject(
	request: Request,
): Promise<Record<string, unknown>> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw new HttpError(400, "جسم الطلب يجب أن يكون JSON صالحاً.");
	}

	if (!body || typeof body !== "object" || Array.isArray(body)) {
		throw new HttpError(400, "جسم الطلب يجب أن يكون كائن JSON.");
	}

	return body as Record<string, unknown>;
}

function normalizeAmount(value: unknown): string {
	const amount =
		typeof value === "number" ? value.toFixed(2) : String(value ?? "").trim();

	if (!AMOUNT_PATTERN.test(amount) || Number(amount) <= 0) {
		throw new HttpError(
			400,
			"المبلغ يجب أن يكون رقماً أكبر من صفر بخانتين عشريتين على الأكثر.",
		);
	}

	return amount;
}

function normalizeCurrency(value: unknown): string {
	if (value === undefined || value === null || value === "") return "USD";

	const code = String(value).toUpperCase();
	if (!(code in CURRENCY_IDS)) {
		throw new HttpError(400, "العملة يجب أن تكون USD أو SYP.");
	}

	return code;
}

function normalizeNote(value: unknown): string {
	if (typeof value !== "string") return "";

	return value.trim().slice(0, 200);
}

function normalizeBillNo(value: unknown): string | null {
	if (value === undefined || value === null || value === "") return null;
	if (typeof value !== "string") {
		throw new HttpError(400, "رقم الفاتورة يجب أن يكون نصاً.");
	}

	const billNo = value.trim();
	if (billNo.length > 64 || /\s/.test(billNo)) {
		throw new HttpError(
			400,
			"رقم الفاتورة يجب ألا يزيد عن 64 محرفاً وألا يحتوي فراغات.",
		);
	}

	return billNo;
}

function generateBillNo(): string {
	const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();

	return `SB-${Date.now().toString(36).toUpperCase()}-${suffix}`;
}

function errorResponse(error: unknown): Response {
	if (error instanceof HttpError) {
		return Response.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ShamCashConfigError) {
		return Response.json({ error: error.message }, { status: 503 });
	}
	if (error instanceof ShamCashApiError) {
		return Response.json(
			{ error: error.message, result: error.result },
			{ status: 502 },
		);
	}
	if (error instanceof ShamCashCryptoError) {
		return Response.json({ error: error.message }, { status: 502 });
	}

	console.error("Sham Cash route failed", error);

	return Response.json(
		{ error: "تعذّر إكمال الطلب." },
		{ status: 500 },
	);
}
