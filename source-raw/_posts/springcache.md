---
title: spring cache
date: 2019-08-06 15:46:52
tags:
  - spring
  - cache
  - 缓存

---

# 前言
读完本文，你会知道：

1. 缓存的基本概念
2. 如何使用spring的缓存
3. 如何改进spring的缓存

# 概述
传统模式下，很多并发不大的系统都是直接将查询请求发到DB：

![直接访问-1](springcache/springcache-direct-1.png)

随着业务发展，业务逻辑会变得越来越复杂，系统并发数也会逐渐上涨，导致传递到DB的查询请求以几何级数上涨，DB慢慢变得不堪重负。

为了应对这个问题，我们需要将常用的数据缓存起来，避免`业务量*N`的查询请求穿透到DB。

## 方案1-外部定时刷新

![外部定时刷新-1](springcache/springcache-side-refresh-1.png)

1. 缓存刷新程序读取DB，然后写入缓存；
2. 联机交易直接读取缓存，不再访问数据库；

这个方案存在几个缺点：

1. 需要特定缓存程序定期刷新。如果这个刷新动作出现问题，会产生大面积的参数变更不生效。
2. 缓存数据格式死板。为了通用，格式必须跟DB表保持一致，应用层获取到之后还需要自行加工处理。
3. 刷新频率无法精细控制。比如一些数据一天刷新一次即可，一些数据需要10秒刷新一次。
4. 无法区分冷热数据，空间利用率差。比如一张表10000条数据，常被访问的也就100条，另外9900条数据可能一年都不会用到一次，还是一样被加载到缓存里面。

## 方案2-访问自动刷新

![访问自动刷新-1](springcache/springcache-access-refresh-1.png)

1. 联机交易访问缓存，如果有值且未过期，直接返回调用者；
2. 访问数据库获取最新值；
3. 写入缓存，返回调用者；

这个方案解决了`方案1`的各种问题，但是还是有许多细节需要处理的。

接下来我们做个demo，看看如何实现一个基本可用的缓存方案，并逐一解决各种问题。

# demo准备工作

## UserService-用户服务接口
接口只有一个方法`getNameFromId`，入参为用户id，返回值为用户名：

```java
public interface UserService {
    public String getNameFromId(String userId);
}
```

## AbstractUserService-用户服务抽象类
提供一个方法模拟实现从DB查询，让子类可以直接调用：

```java
public abstract class AbstractUserService implements UserService {
    private Logger log = LoggerFactory.getLogger(getClass());
    
    protected String getNameFromDb(String userId) {
        log.info("db query: {}", userId);
        return "Name_" + id;
    }
}
```

## testDirect - 测试方法
通过传入不同的实现来测试对应的缓存效果：

```java
    private void testDirect(UserService userSvc, String userId) {
        String name;
        // 1
        name = userSvc.getNameFromId(userId);
        log.info("result: {} -> {}", userId, name);
        // 2
        name = userSvc.getNameFromId(userId);
        log.info("result: {} -> {}", userId, name);
        // 3
        name = userSvc.getNameFromId(userId);
        log.info("result: {} -> {}", userId, name);
    }
```


# 无缓存
无缓存版本直接调用父类方法访问DB：

```java
@Component
public class NoCacheUserService extends AbstractUserService {
    @Override
    public String getNameFromId(String userId) {
        return getNameFromDb(userId);
    }
}
```

执行结果可以观察到每次调用都是访问DB：

```
db query: I0001            
result: I0001 -> Name_I0001
db query: I0001            
result: I0001 -> Name_I0001
db query: I0001            
result: I0001 -> Name_I0001
```

# 原始缓存
程序员的第一想法肯定是不用搞那么多杂七杂八的，我自己动手用Map实现一个缓存：

```java
public class SimpleCacheManager<K, V> {
    private Map<K, V> cache = new ConcurrentHashMap<>();
    
    public V get(K key) {
        return cache.get(key);
    }
    
    public void put(K key, V value) {
        cache.put(key, value);
    }
}
```

修改下业务代码：

```java
@Component
public class SimpleCacheUserService extends AbstractUserService {
    private SimpleCacheManager<String, String> cacheMgr = new SimpleCacheManager<>();
    
    public String getNameFromId(String userId) {
        String name = cacheMgr.get(userId);
        if (name == null) {
            name = getNameFromDb(userId);
            cacheMgr.put(id, name);
        }
        return name;
    }
}
```

执行结果可以观察到只有第一次调用访问DB，后面都是直接从缓存获取

```
db query: I0001            
result: I0001 -> Name_I0001
result: I0001 -> Name_I0001
result: I0001 -> Name_I0001
```

那么，这个方案存在什么不足呢？

1. 侵入性高。业务代码与缓存逻辑耦合在一起，不利于后续维护。
2. 不能灵活扩展，比如某类热点用户id才缓存，其他不缓存。
3. 绑死ConcurrentHashMap，无法随意切换其他更优秀的缓存实现，比如ehcache/redis等。
4. 缺乏自动刷新、过期淘汰等各种特征。

那么，spring是怎么做的呢？

# spring缓存
相比之前侵入式的方案，spring采用的是声明式缓存，缓存逻辑完全脱离业务代码。开发要做的只是在方法上面增加一个注解`@Cacheable`

```java
@Component
public class SpringCacheUserService extends AbstractUserService {
    @Override
    @Cacheable("SpringCache")
    public String getNameFromId(String userId) {
        return getNameFromDb(userId);
    }
}
```

运行后好像没效果，那是因为我们还没开启缓存。在程序入口添加一个注解`@EnableCaching`：

```java
@SpringBootApplication
@EnableCaching
public class TestCacheApp {
}
```

再次运行就可以观察到缓存生效了

如果要实现K开头的用户id才缓存，怎么实现呢？很简单，修改下注解，使用`SPEL`声明条件即可：

```java
@Cacheable(cacheNames="SpringCache", condition="#userId.startsWith('K')")
```

# 原理浅析
原始调用链：

![原始调用链-1](springcache/springcache-aop-1.png)

spring通过AOP，在调用者和目标类中间插入代理类，拦截方法调用，实现缓存逻辑：

![AOP-1](springcache/springcache-aop-2.png)

在此模式下，应用层都是统一一个注解接口，而后端的缓存实现就可以灵活扩展，还能自由`切换、组合`各种优秀的缓存方案（比如ehcache/guava/caffeine/redis）。


# 逐步改进

# 发散思考
