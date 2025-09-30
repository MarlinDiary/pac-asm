import { Schema, model, models, Document } from 'mongoose';
import { Architecture } from '../game/emulator/types';

export interface RunLogDocument extends Document {
  runId: string;
  levelId?: string;
  architecture?: Architecture;
  sourceCode: string;
  createdAt: Date;
  updatedAt: Date;
}

const runLogSchema = new Schema<RunLogDocument>(
  {
    runId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    levelId: {
      type: String,
    },
    architecture: {
      type: String,
      enum: ['ARM', 'MIPS_R6'],
    },
    sourceCode: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const RunLogModel = models.RunLog ?? model<RunLogDocument>('RunLog', runLogSchema);

export default RunLogModel;
