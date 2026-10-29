-- Poll posts: each option's label and votes ([[label, votes], …]) from the daily metrics read.
ALTER TABLE `x_posts` ADD `poll_votes` text;
