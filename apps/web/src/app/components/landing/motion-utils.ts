export const ease = [0.23, 1, 0.32, 1] as const;

export const fadeInUp = {
	hidden: { opacity: 0, y: 30 },
	visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease } },
};

export const fadeInDown = {
	hidden: { opacity: 0, y: -30 },
	visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease } },
};

export const fadeInScale = {
	hidden: { opacity: 0, scale: 0.95 },
	visible: { opacity: 1, scale: 1, transition: { duration: 0.8, ease } },
};

export const staggerContainer = {
	hidden: {},
	visible: {
		transition: {
			staggerChildren: 0.15,
		},
	},
};
