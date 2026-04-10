import {Router, Request, Response} from 'express';
import {
  getTransactionsForPhone,
  getTransaction,
  dismissTransaction,
} from '../services/transactionStore';

export const transactionsRouter = Router();

/**
 * GET /api/transactions/pending?phone=+91...
 * Get pending transactions for a phone number (fetched from AA).
 */
transactionsRouter.get('/pending', async (req: Request, res: Response) => {
  try {
    const phone = req.query.phone as string;

    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({error: 'phone query parameter is required'});
    }

    const transactions = await getTransactionsForPhone(phone);

    return res.json({transactions});
  } catch (err) {
    console.error('Failed to get pending transactions:', err);
    return res.status(500).json({error: 'Internal server error'});
  }
});

/**
 * POST /api/transactions/dismiss/:id
 * Dismiss a server-side pending transaction.
 */
transactionsRouter.post('/dismiss/:id', async (req: Request, res: Response) => {
  const {id} = req.params;

  if (!id) {
    return res.status(400).json({error: 'transaction id is required'});
  }

  try {
    const existing = await getTransaction(id);
    if (!existing) {
      return res.status(404).json({error: 'Transaction not found'});
    }

    await dismissTransaction(id);
    return res.json({success: true, id});
  } catch (err) {
    console.error('Failed to dismiss transaction:', err);
    return res.status(500).json({error: 'Internal server error'});
  }
});
