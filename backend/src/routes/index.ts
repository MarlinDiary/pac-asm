import { Request, Response, Router } from 'express';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.render('index', { title: 'Express' });
});

export default router;
