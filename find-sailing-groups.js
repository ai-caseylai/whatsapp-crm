#!/usr/bin/env node

/**
 * 查询哪个群组讲"帆船"最多
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function findSailingGroups() {
    console.log('🔍 查询哪个群组讲"帆船"最多...\n');
    
    try {
        // 查询所有包含"帆船"的消息
        const { data: messages, error } = await supabase
            .from('whatsapp_messages')
            .select('remote_jid, content, push_name, message_timestamp')
            .or('content.ilike.%帆船%,content.ilike.%sailing%')
            .like('remote_jid', '%@g.us') // 只要群组（群组 JID 以 @g.us 结尾）
            .order('message_timestamp', { ascending: false });
        
        if (error) {
            throw error;
        }
        
        if (!messages || messages.length === 0) {
            console.log('❌ 没有找到包含"帆船"的群组消息');
            return;
        }
        
        console.log(`📊 找到 ${messages.length} 条包含"帆船"的群组消息\n`);
        
        // 按群组统计消息数量
        const groupStats = {};
        
        for (const msg of messages) {
            const groupId = msg.remote_jid;
            
            if (!groupStats[groupId]) {
                groupStats[groupId] = {
                    groupId: groupId,
                    groupName: null, // 稍后从 contacts 表获取
                    count: 0,
                    samples: []
                };
            }
            
            groupStats[groupId].count++;
            
            // 保存前3条样本消息
            if (groupStats[groupId].samples.length < 3) {
                groupStats[groupId].samples.push({
                    text: msg.content?.substring(0, 100),
                    timestamp: msg.message_timestamp
                });
            }
        }
        
        // 获取群组名称
        const groupIds = Object.keys(groupStats);
        if (groupIds.length > 0) {
            const { data: contacts } = await supabase
                .from('whatsapp_contacts')
                .select('jid, name')
                .in('jid', groupIds);
            
            if (contacts) {
                contacts.forEach(contact => {
                    if (groupStats[contact.jid]) {
                        groupStats[contact.jid].groupName = contact.name || contact.jid;
                    }
                });
            }
        }
        
        // 为没有名称的群组设置默认名称
        Object.values(groupStats).forEach(group => {
            if (!group.groupName) {
                group.groupName = group.groupId;
            }
        });
        
        // 转换为数组并排序
        const sortedGroups = Object.values(groupStats)
            .sort((a, b) => b.count - a.count);
        
        // 显示排名
        console.log('🏆 群组排名（按"帆船"提及次数）：\n');
        console.log('排名 | 群组名称 | 提及次数');
        console.log('-----|---------|--------');
        
        sortedGroups.slice(0, 10).forEach((group, index) => {
            console.log(`${index + 1}. ${group.groupName} - ${group.count} 次`);
        });
        
        // 显示第一名的详细信息
        if (sortedGroups.length > 0) {
            const topGroup = sortedGroups[0];
            console.log('\n\n📌 第一名详细信息：');
            console.log(`群组: ${topGroup.groupName}`);
            console.log(`群组ID: ${topGroup.groupId}`);
            console.log(`提及次数: ${topGroup.count} 次`);
            console.log('\n样本消息:');
            
            topGroup.samples.forEach((sample, i) => {
                const date = new Date(sample.timestamp);
                console.log(`\n${i + 1}. [${date.toLocaleString('zh-CN')}]`);
                console.log(`   ${sample.text}...`);
            });
        }
        
    } catch (error) {
        console.error('❌ 查询失败:', error.message);
    }
}

// 执行查询
findSailingGroups().then(() => {
    console.log('\n✅ 查询完成');
    process.exit(0);
});
