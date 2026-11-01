import 'dotenv/config';
import { app } from './app';
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || !process.env.APP_ORIGIN) throw new Error('Configure JWT_SECRET and APP_ORIGIN before starting');
app.listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.log('Dentex API listening'));
