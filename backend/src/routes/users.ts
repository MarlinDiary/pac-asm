import { Request, Response, NextFunction, Router } from 'express';

import { User } from '../models/user';
import { GitHubAuthError, requireVerifiedGitHubIdentity, syncVerifiedGitHubUser } from '../lib/github-auth';

const router = Router();

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const identity = await requireVerifiedGitHubIdentity(req);
    const { record } = await syncVerifiedGitHubUser(identity);

    const plain = record.toObject<User>({
      versionKey: false
    });

    const { _id, ...rest } = plain;

    res.json({
      id: _id.toString(),
      ...rest
    });
  } catch (error) {
    if (error instanceof GitHubAuthError) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }

    next(error);
  }
});

export default router;
