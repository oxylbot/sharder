module.exports = {
	member(data) {
		return {
			id: data.user.id,
			guildID: data.guild_id,
			nickname: data.nick || null,
			roles: data.roles,
			joinedAt: data.joined_at || null,
			user: module.exports.user(data.user)
		};
	},
	role(data) {
		return {
			id: data.id,
			guildID: data.guild_id,
			name: data.name,
			color: data.color,
			position: data.position,
			permissions: data.permissions
		};
	},
	user(data) {
		return {
			id: data.id,
			username: data.username,
			discriminator: data.discriminator,
			avatar: data.avatar || null,
			bot: !!data.bot
		};
	},
	channel(data) {
		return {
			id: data.id,
			guildID: data.guild_id,
			type: data.type,
			position: data.position,
			name: data.name,
			nsfw: !!data.nsfw,
			overwrites: data.permission_overwrites ?
				data.permission_overwrites.map(overwrite => module.exports.overwrite(overwrite)) :
				[],
			userLimit: data.user_limit !== "undefined" ? data.user_limit : null,
			parentID: data.parent_id
		};
	},
	overwrite(data) {
		return {
			id: data.id,
			type: data.type,
			allow: data.allow,
			deny: data.deny
		};
	},
	guild(data) {
		return {
			id: data.id,
			name: data.name,
			icon: data.icon || null,
			ownerID: data.owner_id,
			region: data.region,
			roles: data.roles.map(role => module.exports.role(role)),
			memberCount: data.member_count || null,
			members: data.members ?
				data.members.map(member => module.exports.member(member)) :
				[],
			voiceStates: data.voice_states ?
				data.voice_states.map(voiceState => module.exports.voiceState(voiceState)) :
				[],
			channels: data.channels ?
				data.channels.map(channel => module.exports.channel(channel)) :
				[]
		};
	},
	voiceState(data) {
		return {
			guildID: data.guild_id,
			channelID: data.channel_id,
			userID: data.user_id,
			deaf: data.deaf,
			mute: data.mute,
			selfDeaf: data.self_deaf,
			selfMute: data.self_mute
		};
	}
};
