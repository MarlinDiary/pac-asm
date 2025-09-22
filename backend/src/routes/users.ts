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

export default router;
