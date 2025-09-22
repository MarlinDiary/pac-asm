import { Request, Response, NextFunction, Router } from 'express';

import UserModel, { User } from '../models/user';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await UserModel.find().exec();

    const payload = users.map((user) => {
      const plain = user.toObject<User>({
        versionKey: false
      });

      const { _id, ...rest } = plain;

      return {
        id: _id.toString(),
        ...rest
      };
    });

    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, githubId, name, avatarUrl } = req.body as Partial<User> & {
      githubId?: string;
    };

    if (!email && !githubId) {
      res.status(400).json({ message: 'email or githubId is required' });
      return;
    }

    const filter = githubId ? { githubId } : { email };

    const user = await UserModel.findOneAndUpdate(
      filter,
      {
        email,
        githubId,
        name,
        avatarUrl
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    ).exec();

    const plain = user.toObject<User>({
      versionKey: false
    });

    const { _id, ...rest } = plain;

    res.json({
      id: _id.toString(),
      ...rest
    });
  } catch (error) {
    next(error);
  }
});

export default router;
