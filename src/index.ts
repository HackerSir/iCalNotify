import ical from 'node-ical';

type Env = {
	CALENDER_URL: string;
	WEBHOOK_URL: string;
};

const getTodayRange = () => {
	const todayStr = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Taipei' });

	const regex = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
	const match = todayStr.match(regex);

	if (!match) {
		throw new Error('Invalid date format');
	}

	const [, month, day, year] = match;

	const start = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00+08:00`);
	const end = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T23:59:59+08:00`);

	return { start, end };
};

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		await this.scheduled({} as ScheduledEvent, env, ctx);
		return new Response('OK');
	},
	// The scheduled handler is invoked at the interval set in our wrangler.toml's
	// [[triggers]] configuration.
	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		const icsContent = await fetch(env.CALENDER_URL).then((res) => res.text()); //env.CALENDER_URL;
		const data = ical.parseICS(icsContent);

		// Filter events that are happening today, including multi-day events
		const { start, end } = getTodayRange();

		const events = Object.values(data).filter((ev: any) => {
			if (ev.type == 'VEVENT') {
				return start <= ev.start && end >= ev.start;
			}
		});

		console.log(start, end, events);

		if (events.length === 0) {
			return;
		}

		// Send a Discord webhook for each event
		const embeds = events.map((ev: any) => {
			const start: Date = ev.start;
			const end: Date = ev.end || start;

			const time = `<t:${Math.floor(start.getTime() / 1000)}:F> - <t:${Math.floor(end.getTime() / 1000)}:F>`;
			const location = ev.location || '世界的某個角落';

			return {
				title: ev.summary,
				description: '',
				fields: [
					{
						name: '⏰️時間',
						value: time,
						inline: true,
					},
					{
						name: '📍地點',
						value: location,
						inline: true,
					},
				],
				footer: {
					text: '黑客社行事曆',
				},
			};
		});

		await fetch(env.WEBHOOK_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				content: `${events.map((ev: any) => ev.summary).join('、')}`,
				embeds,
			}),
		});
	},
};
