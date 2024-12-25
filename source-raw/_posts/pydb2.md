---
title: pydb2的编译及改进
date: 2024-12-324 22:45:00
tags:
  - python
  - db2
  - 编译
---

# 概述

公司开发平台使用pydb2来连接db2数据库，之前一直都是提交代码到服务器通过log来调试，操作繁琐并且效率低下。为了支持本地调试，于是有了本次折腾。

一开始是直接用pip安装ibm_db，但是后来发现有些场景本地调试通过，放到服务器运行就报错。毕竟是两套完全不同的库，为了减少本地调试跟服务器之间的差异，还是决定自己在windows重新编译pydb2。

# 安装

## db2服务端

为了测试，需要先安装db2服务端。我选择在wsl下通过docker安装运行。

在本地提前创建好数据目录
```
# mkdir -p /db2/database
```

拉取镜像
```
# docker pull ibmcom/db2
```

查看镜像
```
# docker images
REPOSITORY   TAG       IMAGE ID       CREATED       SIZE
ibmcom/db2   latest    2ec8bf76e622   2 years ago   2.79GB
```

创建容器
```
 # docker run -itd --name testdb --privileged=true -p 50000:50000 -e LICENSE=accept -e DB2INST1_PASSWORD=testdb -e DBNAME=testdb -v /db2/database:/database ibmcom/db2
```

查看容器状态
```
# docker ps -a
CONTAINER ID   IMAGE        COMMAND                  CREATED        STATUS          PORTS
                                                NAMES
9268aef03fb9   ibmcom/db2   "/var/db2_setup/lib/…"   21 hours ago   Up 22 seconds   22/tcp, 55000/tcp, 60006-60007/tcp, 0.0.0.0:50000->50000/tcp, :::50000->50000/tcp   testdb
```

启停容器
```
# docker start testdb
# docker stop testdb
```

进入容器
```
# docker exec -it testdb /bin/bash
# su - db2inst1
```

查看实例版本及状态
```
$ db2level
DB21085I  This instance or install (instance name, where applicable:
"db2inst1") uses "64" bits and DB2 code release "SQL11058" with level
identifier "0609010F".
Informational tokens are "DB2 v11.5.8.0", "s2209201700", "DYN2209201700AMD64",
and Fix Pack "0".
Product is installed at "/opt/ibm/db2/V11.5".

$ db2pd -

Database Member 0 -- Active -- Up 0 days 00:05:29 -- Date 2024-12-24-15.26.25.728524
```

启停实例
```
$ db2start
12/24/2024 15:27:23     0   0   SQL1063N  DB2START processing was successful.
SQL1063N  DB2START processing was successful.

$ db2stop
12/24/2024 15:27:18     0   0   SQL1064N  DB2STOP processing was successful.
SQL1064N  DB2STOP processing was successful.
```

测试数据库
```
$ db2 list db directory

 System Database Directory

 Number of entries in the directory = 1

Database 1 entry:

 Database alias                       = TESTDB
 Database name                        = TESTDB
 Local database directory             = /database/data
 Database release level               = 15.00
 Comment                              =
 Directory entry type                 = Indirect
 Catalog database partition number    = 0
 Alternate server hostname            =
 Alternate server port number         =

$ db2 connect to testdb

   Database Connection Information

 Database server        = DB2/LINUXX8664 11.5.8.0
 SQL authorization ID   = DB2INST1
 Local database alias   = TESTDB

$ db2 "select count(*) from syscat.tables"

1
-----------
        437

  1 record(s) selected.
```

## db2客户端驱动

官网下载：https://www.ibm.com/support/pages/db2-odbc-cli-driver-download-and-installation-information

选择
```
IBM Data Server Client Packages (11.5.*, All platforms)
DSClients-ntx64-dsdriver-11.5.9000.352-FP000
v11.5.9_ntx64_dsdriver_EN.exe
```
下载安装后，需要将安装目录`C:\Program Files\IBM\IBM DATA SERVER DRIVER\bin`配置到`Path`环境变量，验证安装是否成功：
```
> db2level
DB21085I  This instance or install (instance name, where applicable: "*") uses
"64" bits and DB2 code release "SQL11059" with level identifier "060A010F".
Informational tokens are "DB2 v11.5.9000.352", "s2310270807",
"DYN2310270807WIN64", and Fix Pack "0".
Product is installed at "C:\PROGRA~1\IBM\IBMDAT~1" with DB2 Copy Name
"IBMDBCL1".
```

测试数据库
```
> db2cli execsql -connstring "database=testdb;hostname=localhost;port=50000;uid=db2inst1;pwd=testdb"
IBM DATABASE 2 Interactive CLI Sample Program
(C) COPYRIGHT International Business Machines Corp. 1993,1996
All Rights Reserved
Licensed Materials - Property of IBM
US Government Users Restricted Rights - Use, duplication or
disclosure restricted by GSA ADP Schedule Contract with IBM Corp.

> select count(*) from syscat.tables
select count(*) from syscat.tables
FetchAll:  Columns: 1
  1
  437
FetchAll: 1 rows fetched.
```

## python

官网下载2.7的64位版本：https://www.python.org/download/releases/2.7/

## pydb2

官网下载：https://sourceforge.net/projects/pydb2/

这个库官方其实已经完全停止维护，最新代码变更是`2008年`，官方编译的windows版本是`python 2.5`

我们选择下载源码包`PyDB2_1.1.1.tar.gz`

# 编译

## 初步编译

直接编译会报错
```
> python setup.py install
Traceback (most recent call last):
  File "setup.py", line 94, in <module>
    db2rootdir = find_db2rootdir()
  File "setup.py", line 75, in find_db2rootdir
    raise Exception('Unable to locate DB2 installation directory.\nTry editing DB2_ROOT in setup.py')
Exception: Unable to locate DB2 installation directory.
Try editing DB2_ROOT in setup.py
```

翻了下源码，会检测一些环境变量，以及会检测db2level输出的安装位置，这些都已经过时。直接修改源码定义的db2安装路径为本机路径
```
DB2_ROOT = r"C:\Program Files\IBM\IBM DATA SERVER DRIVER"
```

重新编译会继续报另外一个错误
```
> python setup.py install
Found DB2 with user-specified variable
DB2 install path: "C:\Program Files\IBM\IBM DATA SERVER DRIVER"
DB2 include path: "C:\Program Files\IBM\IBM DATA SERVER DRIVER\include"
DB2 lib path:     "C:\Program Files\IBM\IBM DATA SERVER DRIVER\lib"
DB2 library:      "db2cli"
WARNING:
It seems that you did not install the 'Application Development Kit'.
Compilation may fail.
running install
running build
running build_py
creating build
creating build\lib.win-amd64-2.7
copying DB2.py -> build\lib.win-amd64-2.7
running build_ext
building '_db2' extension
error: Unable to find vcvarsall.bat
```
这里提示未安装`vc编译器`

## 安装vc编译器

一开始我直接安装微软最新版本的vc，编译报各种奇奇怪怪的错误，通过搜索[stackoverflow](https://stackoverflow.com/)的问答，发现有几个要求：

1. 编译python扩展模块的vc版本必须与编译python主程序的vc版本一致：`python 2.7`官方版本是使用`Microsoft Visual C++ 2008`编译的。

2. express版本不支持编译64位程序。


可以在[ msdn itellyou](https://msdn.itellyou.cn)找到了对应的安装包，下载安装的时候注意勾选x64支持（默认是不选的）

编译前需要执行vc环境变量初始化脚本（注意需要传入参`x64`）
```
> "E:\Program Files (x86)\Microsoft Visual Studio 9.0\VC\vcvarsall.bat" x64
Setting environment for using Microsoft Visual Studio 2008 Beta2 x64 tools.
```

## 再次编译

重新编译通过，链接时报错
```
> python setup.py install
Found DB2 with user-specified variable
DB2 install path: "C:\Program Files\IBM\IBM DATA SERVER DRIVER"
DB2 include path: "C:\Program Files\IBM\IBM DATA SERVER DRIVER\include"
DB2 lib path:     "C:\Program Files\IBM\IBM DATA SERVER DRIVER\lib"
DB2 library:      "db2cli"
running install
running build
running build_py
running build_ext
building '_db2' extension

E:\Program Files (x86)\Microsoft Visual Studio 9.0\VC\BIN\amd64\cl.exe /c /nologo /Ox /MD /W3 /GS- /DNDEBUG "-IC:\Program Files\IBM\IBM DATA SERVER DRIVER\include" -IC:\Python27\include -IC:\Python27\PC /Tc_db2_module.c /Fobuild\temp.win-amd64-2.7\Release\_db2_module.obj
_db2_module.c

E:\Program Files (x86)\Microsoft Visual Studio 9.0\VC\BIN\amd64\link.exe /DLL /nologo /INCREMENTAL:NO "/LIBPATH:C:\Program Files\IBM\IBM DATA SERVER DRIVER\lib" /LIBPATH:C:\Python27\libs /LIBPATH:C:\Python27\PCbuild\amd64 /LIBPATH:C:\Python27\PC\VS9.0\amd64 db2cli.lib /EXPORT:init_db2 build\temp.win-amd64-2.7\Release\_db2_module.obj /OUT:build\lib.win-amd64-2.7\_db2.pyd /IMPLIB:build\temp.win-amd64-2.7\Release\_db2.lib /MANIFESTFILE:build\temp.win-amd64-2.7\Release\_db2.pyd.manifest
_db2_module.obj : warning LNK4197: 多次指定导出“init_db2”；使用第一个规范
   正在创建库 build\temp.win-amd64-2.7\Release\_db2.lib 和对象 build\temp.win-amd64-2.7\Release\_db2.exp
_db2_module.obj : error LNK2019: 无法解析的外部符号 SQLGetDiagRec，该符号在函数 _DB2_GetDiagRec 中被引用
...
_db2_module.obj : error LNK2019: 无法解析的外部符号 SQLDisconnect，该符号在函数 DB2ConnObj_close 中被引用
build\lib.win-amd64-2.7\_db2.pyd : fatal error LNK1120: 28 个无法解析的外部命令
error: command 'E:\\Program Files (x86)\\Microsoft Visual Studio 9.0\\VC\\BIN\\amd64\\link.exe' failed with exit status 1120
```

这里是因为`python 2.7`本身是64位的，但是链接的时候选择的`db2cli.lib`是32位的。修改`setup.py`将`db2cli`修改为`db2cli64`，重新编译成功。
```
E:\Program Files (x86)\Microsoft Visual Studio 9.0\VC\BIN\amd64\link.exe /DLL /nologo /INCREMENTAL:NO "/LIBPATH:C:\Program Files\IBM\IBM DATA SERVER DRIVER\lib" /LIBPATH:C:\Python27\libs /LIBPATH:C:\Python27\PCbuild\amd64 /LIBPATH:C:\Python27\PC\VS9.0\amd64 db2cli64.lib /EXPORT:init_db2 build\temp.win-amd64-2.7\Release\_db2_module.obj /OUT:build\lib.win-amd64-2.7\_db2.pyd /IMPLIB:build\temp.win-amd64-2.7\Release\_db2.lib /MANIFESTFILE:build\temp.win-amd64-2.7\Release\_db2.pyd.manifest
_db2_module.obj : warning LNK4197: 多次指定导出“init_db2”；使用第一个规范
   正在创建库 build\temp.win-amd64-2.7\Release\_db2.lib 和对象 build\temp.win-amd64-2.7\Release\_db2.exp
running install_lib
copying build\lib.win-amd64-2.7\DB2.py -> C:\Python27\Lib\site-packages
copying build\lib.win-amd64-2.7\_db2.pyd -> C:\Python27\Lib\site-packages
byte-compiling C:\Python27\Lib\site-packages\DB2.py to DB2.pyc
running install_egg_info
Writing C:\Python27\Lib\site-packages\PyDB2-1.1.1-py2.7.egg-info
```

增加数据源
```
> db2cli writecfg add -dsn testdb -database testdb -host localhost -port 50000

===============================================================================
db2cli writecfg completed successfully.
===============================================================================
```

验证数据源
```
> db2cli validate -dsn testdb -connect -user db2inst1 -passwd testdb

===============================================================================
Client information for the current copy (copy name: IBMDBCL1):
===============================================================================

...

===============================================================================
The validation is completed.
===============================================================================
```

修改测试配置`test/Config.py`
```
ConnDict = {
	'dsn':	'testdb',
	'uid':	'db2inst1',
	'pwd':	'testdb',
}
```

运行测试案例，顺利通过
```
> python test/test_basic.py

Ran 46 tests in 6.610s

FAILED (failures=1)
```

# 优化

旧版本db2驱动连接数据库之前是需要本地手工配置好数据源，而新版本支持直接传入`连接字符串`来连接数据库，省去本地手工步骤。
```
> db2cli execsql -connstring "database=testdb;hostname=localhost;port=50000;uid=db2inst1;pwd=testdb"
```

我们修改下源码`_db2_module.c`，让`pydb2`也支持这个特征。

代码很简单，判断到dsn包含字符`;`则使用[SQLDriverConnect ](https://www.ibm.com/docs/en/i/7.5?topic=functions-sqldriverconnect-connect-data-source)连接数据库
```c
char *sep;
SQLCHAR buffer[255];
SQLSMALLINT outlen;

sep = strchr(dsn, ';');

Py_BEGIN_ALLOW_THREADS ;

if (sep == NULL) {
    rc = SQLConnect(c->hdbc,
            (SQLCHAR *)dsn, SQL_NTS,
            (SQLCHAR *)uid, SQL_NTS,
            (SQLCHAR *)pwd, SQL_NTS
        );
} else {
    rc = SQLDriverConnect(c->hdbc,
            (SQLPOINTER) NULL,
            dsn,
            SQL_NTS,
            buffer, 255, &outlen,
            SQL_DRIVER_NOPROMPT);
}

Py_END_ALLOW_THREADS ;

```

测试通过
```
>>> import DB2
>>> conn = DB2.connect("database=testdb;hostname=localhost;port=50000;uid=db2inst1;pwd=testdb", "", "")
>>> cursor = conn.cursor()
>>> cursor.execute("select count(*) from syscat.tables")
>>> cursor.fetchall()
[(437,)]
```
