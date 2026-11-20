---
title: "LoRA: fine-tuning a model by training almost none of it"
description: A short introduction to low-rank adaptation, the trick that makes fine-tuning large models cheap.
math: true
---

Fine-tuning a large model normally means updating every weight: gradients and optimiser state
for billions of numbers, and a full copy of the model for every task. LoRA (low-rank
adaptation) takes a cheaper route. It freezes the model and learns a small correction on top.

## The idea

Take a weight matrix $$W_0 \in \mathbb{R}^{d \times k}$$. Instead of learning a full update
$$\Delta W$$ of the same size, LoRA learns it as the product of two thin matrices:

$$
\Delta W = BA, \qquad B \in \mathbb{R}^{d \times r}, \quad A \in \mathbb{R}^{r \times k}, \quad r \ll \min(d, k)
$$

The layer then computes

$$
h = W_0 x + \frac{\alpha}{r} BAx
$$

Only $$A$$ and $$B$$ are trained; $$W_0$$ stays frozen. $$B$$ starts at zero, so training
begins exactly from the pretrained model.

## Why it is cheap

A 4096 × 4096 matrix has about 16.8 million weights. With $$r = 8$$, LoRA trains
$$8 \times (4096 + 4096) = 65{,}536$$ of them, 256 times fewer. On GPT-3 175B, the original
paper cut trainable parameters by 10,000 times and training memory by 3 times, while matching
full fine-tuning.

After training, the update folds back into the weights:

$$
W = W_0 + \frac{\alpha}{r} BA
$$

So the deployed model is exactly the same size and speed as the original.

## In code

With Hugging Face's PEFT library it takes a few lines:

```python
from peft import LoraConfig, get_peft_model

config = LoraConfig(
    r=8,
    lora_alpha=16,
    target_modules=["q_proj", "v_proj"],
    task_type="CAUSAL_LM",
)
model = get_peft_model(model, config)
model.print_trainable_parameters()   # well under 1% of the model

# ... train as usual ...

model = model.merge_and_unload()     # one plain model to deploy
```

## Where I used it

At Samsung Research I fine-tuned Qwen3-VL-2B with LoRA. Its F1 went from 0.45 to 0.70,
matching the 8B model's quality at about a quarter of the inference cost.

## Further reading

- Hu et al., [LoRA: Low-Rank Adaptation of Large Language Models](https://arxiv.org/abs/2106.09685) (2021)
- Dettmers et al., [QLoRA: Efficient Finetuning of Quantized LLMs](https://arxiv.org/abs/2305.14314) (2023)
- Hugging Face [PEFT documentation](https://huggingface.co/docs/peft)