import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Actor } from './chess-service';
import { chessError } from './chess-service';
import { lessons } from '../../../packages/shared/src/lessons';
import { validateCourseActions, courseLessons } from '../../../packages/shared/src/courses';
import {
  chessEngine,
  type ChessState,
  type ChessAction,
} from '../../../packages/games/chess/engine';
import {
  applyBoard,
  type BoardState,
  type BoardAction,
} from '../../../packages/games/board-engine';
import { pool } from './database';
import { awardActivity } from './progress';
export function registerLearning(
  app: FastifyInstance,
  actorFrom: (cookies: Record<string, string | undefined>) => Promise<Actor | null>,
) {
  app.get('/api/learn', async (req) => {
    const a = await actorFrom(req.cookies),
      done = a?.userId
        ? (
            await pool.query<{ lesson: string }>(
              'SELECT lesson FROM tutorial_progress WHERE user_id=$1',
              [a.userId],
            )
          ).rows.map((r) => r.lesson)
        : [];
    return {
      lessons: lessons.map(({ id, game, title, task }) => ({
        id,
        game,
        title,
        task,
        completed: done.includes(id),
      })),
    };
  });
  app.get('/api/learn/:id', async (req) => {
    const { id } = z.object({ id: z.string().max(60) }).parse(req.params),
      lesson = lessons.find((l) => l.id === id);
    if (!lesson) chessError('NOT_FOUND', 404);
    return { lesson };
  });
  app.post('/api/learn/:id/complete', async (req) => {
    const a = await actorFrom(req.cookies),
      { id } = z.object({ id: z.string().max(60) }).parse(req.params),
      { action, daily, courseActions } = z
        .object({
          action: z.unknown(),
          daily: z.boolean().default(false),
          courseActions: z.array(z.unknown()).max(24).optional(),
        })
        .strict()
        .parse(req.body),
      lesson = lessons.find((l) => l.id === id);
    if (!lesson) chessError('NOT_FOUND', 404);
    if (courseActions) {
      const steps = courseLessons(lesson.game);
      if (
        steps[courseActions.length]?.id !== id ||
        !validateCourseActions(lesson.game, [...courseActions, action])
      )
        chessError('LESSON_WRONG');
    }
    if (JSON.stringify(action) !== JSON.stringify(lesson.answer)) chessError('LESSON_WRONG');
    try {
      if (lesson.game === 'chess')
        chessEngine.apply(lesson.state as ChessState, action as ChessAction);
      else applyBoard(lesson.game, lesson.state as BoardState, action as BoardAction);
    } catch {
      chessError('LESSON_WRONG');
    }
    if (!a?.userId) return { completed: true, saved: false };
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [a.userId]);
      await c.query(
        'INSERT INTO tutorial_progress(user_id,lesson) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [a.userId, id],
      );
      await awardActivity(c, a.userId, `lesson:${id}`, 15);
      await c.query(
        "INSERT INTO achievements(user_id,code) VALUES($1,'first_lesson') ON CONFLICT DO NOTHING",
        [a.userId],
      );
      if (daily) {
        const day = new Date().toISOString().slice(0, 10),
          selected = lessons[Math.floor(Date.parse(day) / 86400000) % lessons.length];
        if (selected.id !== id) chessError('LESSON_WRONG');
        await awardActivity(c, a.userId, `daily:${day}`, 25);
      }
      await c.query('COMMIT');
      return { completed: true, saved: true };
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  });
  app.get('/api/daily', () => {
    const day = new Date().toISOString().slice(0, 10);
    return { day, lesson: lessons[Math.floor(Date.parse(day) / 86400000) % lessons.length].id };
  });
}
