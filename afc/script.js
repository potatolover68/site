function toCompactTimestamp(input, opts = {}) {
	const {
		allowNativeFallback = true
	} = opts;

	if (input instanceof Date) {
		if (Number.isNaN(input.getTime())) throw new TypeError('Invalid Date object');
		return fromDateUTC(input);
	}
	if (typeof input !== 'string') {
		throw new TypeError('Input must be a string or Date');
	}

	const s = input.trim();
	if (s === '') throw new SyntaxError('Empty input');

	for (const parse of PARSERS) {
		const c = parse(s);
		if (c) return assemble(c);
	}

	if (allowNativeFallback) {
		const d = new Date(s);
		if (!Number.isNaN(d.getTime())) return fromDateUTC(d);
	}

	throw new SyntaxError('Unrecognized date format: ' + JSON.stringify(input));
}

const MONTHS = {
	jan: 1,
	january: 1,
	feb: 2,
	february: 2,
	mar: 3,
	march: 3,
	apr: 4,
	april: 4,
	may: 5,
	jun: 6,
	june: 6,
	jul: 7,
	july: 7,
	aug: 8,
	august: 8,
	sep: 9,
	sept: 9,
	september: 9,
	oct: 10,
	october: 10,
	nov: 11,
	november: 11,
	dec: 12,
	december: 12,
};

const pad = (n, len = 2) => String(n).padStart(len, '0');
const num = (x) => (x == null ? undefined : Number(x));

function offsetToMinutes(tz) {
	if (!tz) return 0;
	const u = tz.toUpperCase();
	if (u === 'Z' || u === 'UT' || u === 'UTC' || u === 'GMT') return 0;
	const m = /^([+-])(\d{2}):?(\d{2})$/.exec(tz);
	if (!m) return 0;
	const sign = m[1] === '-' ? -1 : 1;
	return sign * (Number(m[2]) * 60 + Number(m[3]));
}

function validateRanges(c) {
	const checks = [
		['month', c.month, 1, 12],
		['day', c.day, 1, 31],
		['hour', c.hour, 0, 23],
		['minute', c.min, 0, 59],
		['second', c.sec, 0, 59],
	];
	for (const [name, v, lo, hi] of checks) {
		if (v != null && (!Number.isInteger(v) || v < lo || v > hi)) {
			throw new RangeError(`${name} out of range: ${v}`);
		}
	}
	if (c.year != null && (c.year < 0 || c.year > 9999)) {
		throw new RangeError(`year out of range: ${c.year}`);
	}
	return c;
}

function fromDateUTC(d) {
	return (
		pad(d.getUTCFullYear(), 4) +
		pad(d.getUTCMonth() + 1) +
		pad(d.getUTCDate()) +
		pad(d.getUTCHours()) +
		pad(d.getUTCMinutes()) +
		pad(d.getUTCSeconds())
	);
}

function assemble(c) {
	validateRanges(c);
	const year = c.year ?? 1970;
	const month = c.month ?? 1;
	const day = c.day ?? 1;
	const hour = c.hour ?? 0;
	const min = c.min ?? 0;
	const sec = c.sec ?? 0;
	const offMin = c.offsetMinutes ?? 0;

	// UTC = (components interpreted as UTC) - offset.
	const ms = Date.UTC(year, month - 1, day, hour, min, sec) - offMin * 60000;
	const d = new Date(ms);
	if (Number.isNaN(d.getTime())) {
		throw new RangeError('Could not construct a valid date from: ' + JSON.stringify(c));
	}

	if (
		offMin === 0 &&
		(d.getUTCFullYear() !== year ||
			d.getUTCMonth() + 1 !== month ||
			d.getUTCDate() !== day ||
			d.getUTCHours() !== hour ||
			d.getUTCMinutes() !== min ||
			d.getUTCSeconds() !== sec)
	) {
		throw new RangeError('Invalid calendar date: ' + JSON.stringify(c));
	}

	return fromDateUTC(d);
}

// format parsers  (each returns a component object, or null if it doesn't match), most specific / unambiguous first

const PARSERS = [
	// ISO 8601 extended (with date separators -, / or .). Year required.
	function iso(s) {
		const m = /^(\d{4})(?:[-/.](\d{1,2})(?:[-/.](\d{1,2}))?)?(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?)?\s*(Z|UTC?|GMT|[+-]\d{2}:?\d{2})?$/i.exec(s);
		if (!m) return null;
		return {
			year: num(m[1]),
			month: num(m[2]),
			day: num(m[3]),
			hour: num(m[4]),
			min: num(m[5]),
			sec: num(m[6]),
			offsetMinutes: offsetToMinutes(m[7]),
		};
	},

	// ISO 8601 basic (no separators): YYYYMMDD[HHMM[SS]], optional T, optional offset.
	function isoBasic(s) {
		const m = /^(\d{4})(\d{2})(\d{2})(?:T?(\d{2})(\d{2})(\d{2})?)?\s*(Z|UTC?|GMT|[+-]\d{4})?$/i.exec(s);
		if (!m) return null;
		return {
			year: num(m[1]),
			month: num(m[2]),
			day: num(m[3]),
			hour: num(m[4]),
			min: num(m[5]),
			sec: num(m[6]),
			offsetMinutes: offsetToMinutes(m[7]),
		};
	},

	// Time only -> defaults to 1970-01-01.
	function timeOnly(s) {
		const m = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?\s*(Z|UTC?|GMT|[+-]\d{2}:?\d{2})?$/i.exec(s);
		if (!m) return null;
		return {
			hour: num(m[1]),
			min: num(m[2]),
			sec: num(m[3]),
			offsetMinutes: offsetToMinutes(m[4]),
		};
	},

	// Wikipedia signature: "05:09, 20 May 2026 (UTC)". Stored sigs are always UTC.
	function wikiSig(s) {
		const m = /^(\d{1,2}):(\d{2}),\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*\(UTC\)$/.exec(s);
		if (!m) return null;
		const month = MONTHS[m[4].toLowerCase()];
		if (!month) return null;
		return {
			year: num(m[5]),
			month,
			day: num(m[3]),
			hour: num(m[1]),
			min: num(m[2]),
			sec: undefined, // no seconds in sig -> 00
			offsetMinutes: 0,
		};
	},

	// RFC 2822: "[Wed, ]20 May 2026 05:09[:00] [GMT|UTC|±hhmm]".
	function rfc(s) {
		const m = /^(?:[A-Za-z]{3,9},?\s+)?(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*(Z|UT|UTC|GMT|[+-]\d{4}|[+-]\d{2}:\d{2})?$/i.exec(s);
		if (!m) return null;
		const month = MONTHS[m[2].toLowerCase()];
		if (!month) return null;
		return {
			year: num(m[3]),
			month,
			day: num(m[1]),
			hour: num(m[4]),
			min: num(m[5]),
			sec: num(m[6]),
			offsetMinutes: offsetToMinutes(m[7]),
		};
	},

	// Month-name first: "May 20, 2026" | "May 20th 2026 05:09:00 GMT".
	function monthFirst(s) {
		const m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*(Z|UT|UTC|GMT|[+-]\d{4}|[+-]\d{2}:\d{2})?$/i.exec(s);
		if (!m) return null;
		const month = MONTHS[m[1].toLowerCase()];
		if (!month) return null;
		return {
			year: num(m[3]),
			month,
			day: num(m[2]),
			hour: num(m[4]),
			min: num(m[5]),
			sec: num(m[6]),
			offsetMinutes: offsetToMinutes(m[7]),
		};
	},
];

if (typeof module !== 'undefined' && module.exports) {
	module.exports = toCompactTimestamp;
}
