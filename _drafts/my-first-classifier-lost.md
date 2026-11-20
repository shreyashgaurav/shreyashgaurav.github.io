---
title: My first classifier lost to a threshold
description: Why a trained model first did worse than a one-line rule, and what fixed it.
math: true
---

<!--
  HOW TO PUBLISH A POST
  1. Files in _drafts/ are never published. Copy this file into _posts/ and rename it
     with the publish date first: _posts/2026-12-01-my-first-classifier-lost.md
     (the part after the date becomes the address: /writing/my-first-classifier-lost/).
  2. Edit the title and description above. Keep "math: true" only if the post has maths.
  3. Commit and push. GitHub rebuilds the site in about a minute. The first post makes
     the Writing section and the "Writing" menu item appear on the homepage by themselves.
  IMAGES: put them in assets/img/ and reference them like this:
    ![Duplicate groups in the DejaView demo](/assets/img/dejaview-groups.png)
  Delete this comment block before publishing.
-->

Write in plain Markdown. Paragraphs are separated by a blank line, **bold** and *italic*
work as usual, and [links look like this](https://shreyashgaurav.github.io/deja-view).

## Code

Inline code uses backticks: `std::popcount(a ^ b)`. Blocks use three backticks and the
language name, which turns on syntax colours:

```cpp
// Hamming distance between two 64-bit fingerprints
inline int hamming(std::uint64_t a, std::uint64_t b) {
    return std::popcount(a ^ b);
}
```

## Maths

Inline maths goes between double dollar signs in a sentence, like $$p = \sigma(w \cdot x + b)$$.
A formula on its own line, with blank lines around it, is shown centred:

$$
C[k] = \alpha(k) \sum_{n=0}^{N-1} x[n] \cos\left(\frac{\pi (2n+1) k}{2N}\right)
$$

## Tables

| Model | Precision | Recall |
|---|---|---|
| Threshold | 0.978 | 0.977 |
| Classifier | 0.987 | 1.000 |
